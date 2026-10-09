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
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  startAt,
  where,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore'
import { db } from './firebase'
import { DEFAULT_REASON_TAGS, type AnalysisResult, type Backup, type Entry, type Mood, type ReasonTag, type Stats, type WeatherSnapshot } from './types'
import { calculateStats, isValidDate, MAX_REASON_LABEL_LENGTH, monthAfter, sevenDayComparison, validateBackup, validateEntry } from './diaryLogic'

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
    ...(Array.isArray(data.reasonIds) ? { reason_ids: data.reasonIds.filter((value: unknown): value is string => typeof value === 'string') } : {}),
    weather,
    created_at: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : new Date(data.createdAt).toISOString(),
    updated_at: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate().toISOString() : new Date(data.updatedAt).toISOString(),
  }
}

function reasonTagFromDocument(id: string, data: DocumentData): ReasonTag {
  return {
    id,
    label: data.label,
    active: data.active,
    built_in: data.builtIn,
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

function reasonTagsRef(uid: string) {
  return collection(requireDb(), 'users', uid, 'reasonTags')
}

async function listReasonTags(uid: string) {
  const result = await getDocs(query(reasonTagsRef(uid), orderBy(documentId())))
  const stored = new Map(result.docs.map((snapshot) => [snapshot.id, reasonTagFromDocument(snapshot.id, snapshot.data())]))
  const fallbackTimestamp = '1970-01-01T00:00:00.000Z'
  const defaults = DEFAULT_REASON_TAGS.map(({ id, label }) => stored.get(id) ?? {
    id,
    label,
    active: true,
    built_in: true,
    created_at: fallbackTimestamp,
    updated_at: fallbackTimestamp,
  })
  const custom = [...stored.values()].filter((tag) => !DEFAULT_REASON_TAGS.some((item) => item.id === tag.id))
  return [...defaults, ...custom]
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
    async hasAnyEntries() {
      const generation = await currentGeneration(uid)
      const result = await getDocs(query(entriesRef(uid, generation), limit(1)))
      return !result.empty
    },

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
      startDate.setUTCDate(startDate.getUTCDate() - (days === 7 ? 14 : days - 1))
      const start = startDate.toISOString().slice(0, 10)
      const generation = await currentGeneration(uid)
      const result = await getDocs(query(
        entriesRef(uid, generation),
        orderBy(documentId()),
        startAt(start),
        endAt(end),
      ))
      const pool = result.docs.map((snapshot) => entryFromDocument(snapshot.id, snapshot.data())).reverse()
      const displayStart = new Date(`${end}T00:00:00Z`)
      displayStart.setUTCDate(displayStart.getUTCDate() - days + 1)
      const displayStartValue = displayStart.toISOString().slice(0, 10)
      const entries = pool.filter((entry) => entry.date >= displayStartValue)
      return days === 7
        ? { days, ...calculateStats(entries), entries, comparison: sevenDayComparison(pool, end), comparison_pool: pool }
        : { days, ...calculateStats(entries), entries }
    },

    async save(date: string, entry: { mood: Mood; note: string; reason_ids?: string[]; weather?: WeatherSnapshot }) {
      if (!isValidDate(date)) throw new Error('오늘 또는 과거 날짜를 선택해 주세요.')
      const validationError = validateEntry(entry)
      if (validationError) throw new Error(validationError)
      const firestore = requireDb()
      const generation = await currentGeneration(uid)
      const entryRef = doc(entriesRef(uid, generation), date)
      return runTransaction(firestore, async (transaction) => {
        const snapshot = await transaction.get(entryRef)
        const previousWeather = snapshot.data()?.weather
        const previousReasonIds = snapshot.data()?.reasonIds
        const weather = entry.weather ? {
          icon: entry.weather.icon,
          description: entry.weather.description,
          ...(entry.weather.temperature !== undefined ? { temperature: entry.weather.temperature } : {}),
          ...(entry.weather.location ? { location: entry.weather.location } : {}),
          ...(entry.weather.observed_at ? { observedAt: Timestamp.fromDate(new Date(entry.weather.observed_at)) } : {}),
        } : previousWeather
        const reasonIds = entry.reason_ids !== undefined
          ? entry.reason_ids
          : Array.isArray(previousReasonIds) ? previousReasonIds : []
        const now = Timestamp.now()
        const createdAt = snapshot.data()?.createdAt instanceof Timestamp ? snapshot.data()!.createdAt : now
        transaction.set(entryRef, {
          mood: entry.mood,
          note: entry.note.trim(),
          ...(reasonIds.length ? { reasonIds } : {}),
          ...(weather ? { weather } : {}),
          createdAt: snapshot.data()?.createdAt ?? serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
        return entryFromDocument(date, {
          mood: entry.mood,
          note: entry.note.trim(),
          ...(reasonIds.length ? { reasonIds } : {}),
          ...(weather ? { weather } : {}),
          createdAt,
          updatedAt: now,
        })
      })
    },

    async remove(date: string) {
      if (!isValidDate(date)) throw new Error('날짜를 확인해 주세요.')
      const generation = await currentGeneration(uid)
      await deleteDoc(doc(entriesRef(uid, generation), date))
    },

    async exportBackup(): Promise<Backup> {
      const generation = await currentGeneration(uid)
      const [result, reasonTags] = await Promise.all([
        getDocs(query(entriesRef(uid, generation), orderBy(documentId()))),
        listReasonTags(uid),
      ])
      return {
        schemaVersion: 3,
        exportedAt: new Date().toISOString(),
        entries: result.docs.map((snapshot) => entryFromDocument(snapshot.id, snapshot.data())),
        reason_tags: reasonTags,
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
              ...(entry.reason_ids ? { reasonIds: entry.reason_ids } : {}),
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

        for (let index = 0; index < backup.reason_tags.length; index += WRITE_BATCH_SIZE) {
          const batch = writeBatch(firestore)
          for (const tag of backup.reason_tags.slice(index, index + WRITE_BATCH_SIZE)) {
            batch.set(doc(reasonTagsRef(uid), tag.id), {
              label: tag.label,
              active: tag.active,
              builtIn: tag.built_in,
              createdAt: Timestamp.fromDate(new Date(tag.created_at)),
              updatedAt: Timestamp.fromDate(new Date(tag.updated_at)),
            })
          }
          await batch.commit()
        }
      } catch (error) {
        void deleteGeneration(uid, nextGeneration)
        throw error
      }

      void deleteGeneration(uid, previousGeneration)
      return { imported: backup.entries.length }
    },

    async listReasonTags() {
      return listReasonTags(uid)
    },

    async createReasonTag(label: string) {
      const normalized = label.trim()
      if (!normalized || normalized.length > MAX_REASON_LABEL_LENGTH) {
        throw new Error(`이유 이름은 ${MAX_REASON_LABEL_LENGTH}자까지 입력할 수 있습니다.`)
      }
      const id = `custom-${crypto.randomUUID()}`
      const tagRef = doc(reasonTagsRef(uid), id)
      await runTransaction(requireDb(), async (transaction) => {
        transaction.set(tagRef, {
          label: normalized,
          active: true,
          builtIn: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      })
      const saved = await getDoc(tagRef)
      return reasonTagFromDocument(saved.id, saved.data()!)
    },

    async setReasonTagActive(id: string, active: boolean) {
      const tagRef = doc(reasonTagsRef(uid), id)
      await runTransaction(requireDb(), async (transaction) => {
        const snapshot = await transaction.get(tagRef)
        if (snapshot.exists()) {
          transaction.update(tagRef, { active, updatedAt: serverTimestamp() })
          return
        }
        const defaultTag = DEFAULT_REASON_TAGS.find((tag) => tag.id === id)
        if (!defaultTag) throw new Error('이유 태그를 찾지 못했습니다.')
        transaction.set(tagRef, {
          label: defaultTag.label,
          active,
          builtIn: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      })
    },

    async renameReasonTag(id: string, label: string) {
      const normalized = label.trim()
      if (!normalized || [...normalized].length > MAX_REASON_LABEL_LENGTH) {
        throw new Error(`이유 이름은 ${MAX_REASON_LABEL_LENGTH}자까지 입력할 수 있습니다.`)
      }
      const tagRef = doc(reasonTagsRef(uid), id)
      await runTransaction(requireDb(), async (transaction) => {
        const snapshot = await transaction.get(tagRef)
        if (!snapshot.exists() || snapshot.data().builtIn === true) {
          throw new Error('직접 추가한 이유만 수정할 수 있습니다.')
        }
        transaction.update(tagRef, { label: normalized, updatedAt: serverTimestamp() })
      })
    },

    async deleteReasonTag(id: string) {
      const tagRef = doc(reasonTagsRef(uid), id)
      const tag = await getDoc(tagRef)
      if (!tag.exists() || tag.data().builtIn === true) {
        throw new Error('직접 추가한 이유만 삭제할 수 있습니다.')
      }

      const generation = await currentGeneration(uid)
      const affected = await getDocs(query(entriesRef(uid, generation), where('reasonIds', 'array-contains', id)))
      for (let index = 0; index < affected.docs.length; index += WRITE_BATCH_SIZE) {
        const batch = writeBatch(requireDb())
        for (const snapshot of affected.docs.slice(index, index + WRITE_BATCH_SIZE)) {
          const reasonIds = Array.isArray(snapshot.data().reasonIds)
            ? snapshot.data().reasonIds.filter((reasonId: unknown) => reasonId !== id)
            : []
          batch.update(snapshot.ref, { reasonIds, updatedAt: serverTimestamp() })
        }
        await batch.commit()
      }
      await deleteDoc(tagRef)
    },
  }
}
