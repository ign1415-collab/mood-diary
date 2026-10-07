import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  documentId,
  endAt,
  endBefore,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  startAt,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore'
import { db } from './firebase'
import type { AnalysisResult, Backup, Entry, Mood, Stats, WeatherSnapshot } from './types'
import { calculateStats, isValidDate, monthAfter, validateBackup, validateEntry } from './diaryLogic'

const WRITE_BATCH_SIZE = 400

function requireDb() {
  if (!db) throw new Error('Firebase 데이터베이스 연결이 준비되지 않았습니다.')
  return db
}

function entryFromDocument(id: string, data: DocumentData): Entry {
  const weather = data.weather && typeof data.weather === 'object' ? {
    icon: data.weather.icon,
    description: data.weather.description,
    ...(typeof data.weather.temperature === 'number' ? { temperature: data.weather.temperature } : {}),
    ...(typeof data.weather.location === 'string' ? { location: data.weather.location } : {}),
    ...(data.weather.observedAt ? {
      observed_at: data.weather.observedAt instanceof Timestamp
        ? data.weather.observedAt.toDate().toISOString()
        : new Date(data.weather.observedAt).toISOString(),
    } : {}),
  } satisfies WeatherSnapshot : undefined
  return {
    date: id,
    mood: data.mood as Mood,
    note: data.note,
    weather,
    created_at: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : new Date(data.createdAt).toISOString(),
    updated_at: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate().toISOString() : new Date(data.updatedAt).toISOString(),
  }
}

async function currentGeneration(uid: string) {
  const firestore = requireDb()
  const userRef = doc(firestore, 'users', uid)
  return runTransaction(firestore, async (transaction) => {
    const snapshot = await transaction.get(userRef)
    const current = snapshot.data()?.currentGeneration
    if (typeof current === 'string' && current) return current
    transaction.set(userRef, {
      currentGeneration: 'main',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return 'main'
  })
}

function entriesRef(uid: string, generation: string) {
  return collection(requireDb(), 'users', uid, 'diaries', generation, 'entries')
}

async function listBetween(uid: string, start: string, endExclusive: string) {
  const generation = await currentGeneration(uid)
  const result = await getDocs(query(
    entriesRef(uid, generation),
    orderBy(documentId()),
    startAt(start),
    endBefore(endExclusive),
  ))
  return result.docs.map((snapshot) => entryFromDocument(snapshot.id, snapshot.data()))
}

async function deleteGeneration(uid: string, generation: string) {
  const firestore = requireDb()
  const snapshots = await getDocs(entriesRef(uid, generation))
  for (let index = 0; index < snapshots.docs.length; index += WRITE_BATCH_SIZE) {
    const batch = writeBatch(firestore)
    for (const snapshot of snapshots.docs.slice(index, index + WRITE_BATCH_SIZE)) batch.delete(snapshot.ref)
    await batch.commit()
  }
  await deleteDoc(doc(firestore, 'users', uid, 'diaries', generation)).catch(() => undefined)
}

export function createDiaryApi(uid: string) {
  return {
    async list(month: string) {
      return listBetween(uid, `${month}-01`, `${monthAfter(month)}-01`)
    },

    async stats(month: string): Promise<Stats> {
      return calculateStats(await this.list(month))
    },

    async analysis(days: 7 | 30): Promise<AnalysisResult> {
      const today = new Date()
      const end = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      const startDate = new Date(`${end}T00:00:00Z`)
      startDate.setUTCDate(startDate.getUTCDate() - days + 1)
      const start = startDate.toISOString().slice(0, 10)
      const generation = await currentGeneration(uid)
      const result = await getDocs(query(
        entriesRef(uid, generation),
        orderBy(documentId()),
        startAt(start),
        endAt(end),
      ))
      const entries = result.docs.map((snapshot) => entryFromDocument(snapshot.id, snapshot.data())).reverse()
      return { days, ...calculateStats(entries), entries }
    },

    async save(date: string, entry: { mood: Mood; note: string; weather?: WeatherSnapshot }) {
      if (!isValidDate(date)) throw new Error('오늘 또는 과거 날짜를 선택해 주세요.')
      const validationError = validateEntry(entry)
      if (validationError) throw new Error(validationError)
      const firestore = requireDb()
      const generation = await currentGeneration(uid)
      const entryRef = doc(entriesRef(uid, generation), date)
      await runTransaction(firestore, async (transaction) => {
        const snapshot = await transaction.get(entryRef)
        const previousWeather = snapshot.data()?.weather
        const weather = entry.weather ? {
          icon: entry.weather.icon,
          description: entry.weather.description,
          ...(entry.weather.temperature !== undefined ? { temperature: entry.weather.temperature } : {}),
          ...(entry.weather.location ? { location: entry.weather.location } : {}),
          ...(entry.weather.observed_at ? { observedAt: Timestamp.fromDate(new Date(entry.weather.observed_at)) } : {}),
        } : previousWeather
        transaction.set(entryRef, {
          mood: entry.mood,
          note: entry.note.trim(),
          ...(weather ? { weather } : {}),
          createdAt: snapshot.data()?.createdAt ?? serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      })
      const saved = await getDoc(entryRef)
      return entryFromDocument(saved.id, saved.data()!)
    },

    async remove(date: string) {
      if (!isValidDate(date)) throw new Error('날짜를 확인해 주세요.')
      const generation = await currentGeneration(uid)
      await deleteDoc(doc(entriesRef(uid, generation), date))
    },

    async exportBackup(): Promise<Backup> {
      const generation = await currentGeneration(uid)
      const result = await getDocs(query(entriesRef(uid, generation), orderBy(documentId())))
      return {
        schemaVersion: 2,
        exportedAt: new Date().toISOString(),
        entries: result.docs.map((snapshot) => entryFromDocument(snapshot.id, snapshot.data())),
      }
    },

    async restore(value: unknown) {
      const backup = validateBackup(value)
      const firestore = requireDb()
      const previousGeneration = await currentGeneration(uid)
      const nextGeneration = `restore-${crypto.randomUUID()}`
      const diaryRef = doc(firestore, 'users', uid, 'diaries', nextGeneration)

      try {
        const metadataBatch = writeBatch(firestore)
        metadataBatch.set(diaryRef, {
          createdAt: serverTimestamp(),
          restoredAt: serverTimestamp(),
          count: backup.entries.length,
        })
        await metadataBatch.commit()

        for (let index = 0; index < backup.entries.length; index += WRITE_BATCH_SIZE) {
          const batch = writeBatch(firestore)
          for (const entry of backup.entries.slice(index, index + WRITE_BATCH_SIZE)) {
            const weather = entry.weather ? {
              icon: entry.weather.icon,
              description: entry.weather.description,
              ...(entry.weather.temperature !== undefined ? { temperature: entry.weather.temperature } : {}),
              ...(entry.weather.location ? { location: entry.weather.location } : {}),
              ...(entry.weather.observed_at ? { observedAt: Timestamp.fromDate(new Date(entry.weather.observed_at)) } : {}),
            } : undefined
            batch.set(doc(entriesRef(uid, nextGeneration), entry.date), {
              mood: entry.mood,
              note: entry.note,
              ...(weather ? { weather } : {}),
              createdAt: Timestamp.fromDate(new Date(entry.created_at)),
              updatedAt: Timestamp.fromDate(new Date(entry.updated_at)),
            })
          }
          await batch.commit()
        }

        await runTransaction(firestore, async (transaction) => {
          const userRef = doc(firestore, 'users', uid)
          const snapshot = await transaction.get(userRef)
          if (snapshot.data()?.currentGeneration !== previousGeneration) {
            throw new Error('다른 화면에서 기록이 변경되어 복원을 중단했습니다.')
          }
          transaction.update(userRef, { currentGeneration: nextGeneration, updatedAt: serverTimestamp() })
        })
      } catch (error) {
        void deleteGeneration(uid, nextGeneration)
        throw error
      }

      void deleteGeneration(uid, previousGeneration)
      return { imported: backup.entries.length }
    },
  }
}
