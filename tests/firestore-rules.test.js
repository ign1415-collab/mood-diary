import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { Timestamp, deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'

const projectId = 'mood-diary-rules-test'
let environment

function entry(overrides = {}) {
  const timestamp = Timestamp.fromDate(new Date('2026-10-01T00:00:00.000Z'))
  return {
    mood: 'happy',
    note: '좋은 하루',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  }
}

describe('Firestore 사용자별 보안 규칙', () => {
  before(async () => {
    environment = await initializeTestEnvironment({
      projectId,
      firestore: { rules: await readFile('firestore.rules', 'utf8') },
    })
  })

  beforeEach(async () => environment.clearFirestore())
  after(async () => environment.cleanup())

  test('SEC1 로그인한 사용자는 자신의 기록만 읽고 쓸 수 있다', async () => {
    const alice = environment.authenticatedContext('alice').firestore()
    const bob = environment.authenticatedContext('bob').firestore()
    const aliceEntry = doc(alice, 'users/alice/diaries/main/entries/2026-10-01')

    await assertSucceeds(setDoc(doc(alice, 'users/alice'), {
      currentGeneration: 'main',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    }))
    await assertSucceeds(setDoc(aliceEntry, entry()))
    await assertSucceeds(getDoc(aliceEntry))
    await assertFails(getDoc(doc(bob, 'users/alice/diaries/main/entries/2026-10-01')))
    const guest = environment.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(guest, 'users/alice/diaries/main/entries/2026-10-01')))
  })

  test('SEC2 다른 사용자의 경로에는 기록을 만들 수 없다', async () => {
    const bob = environment.authenticatedContext('bob').firestore()
    await assertFails(setDoc(doc(bob, 'users/alice/diaries/main/entries/2026-10-01'), entry()))
  })

  test('H3 감정 8개는 허용하고 알 수 없는 감정과 긴 메모를 거부한다', async () => {
    const alice = environment.authenticatedContext('alice').firestore()
    const moods = ['happy', 'calm', 'excited', 'neutral', 'depressed', 'anxious', 'tired', 'angry']
    for (const [index, mood] of moods.entries()) {
      await assertSucceeds(setDoc(
        doc(alice, `users/alice/diaries/main/entries/2026-10-${String(index + 1).padStart(2, '0')}`),
        entry({ mood }),
      ))
    }
    await assertFails(setDoc(
      doc(alice, 'users/alice/diaries/main/entries/2026-10-20'),
      entry({ mood: 'confused' }),
    ))
    await assertFails(setDoc(
      doc(alice, 'users/alice/diaries/main/entries/2026-10-02'),
      entry({ note: '가'.repeat(301) }),
    ))
  })

  test('D7 날짜 형식이 아닌 문서 ID를 거부한다', async () => {
    const alice = environment.authenticatedContext('alice').firestore()
    await assertFails(setDoc(doc(alice, 'users/alice/diaries/main/entries/today'), entry()))
    assert.ok(true)
  })

  test('R6 기본 이유는 이름 변경·삭제가 안 되고 숨기기만 된다', async () => {
    const alice = environment.authenticatedContext('alice').firestore()
    const health = doc(alice, 'users/alice/reasonTags/health')
    const now = Timestamp.now()
    await assertSucceeds(setDoc(health, { label: '건강', active: true, builtIn: true, createdAt: now, updatedAt: now }))
    await assertSucceeds(updateDoc(health, { active: false, updatedAt: Timestamp.now() }))
    await assertFails(updateDoc(health, { label: '몸', updatedAt: Timestamp.now() }))
    await assertFails(deleteDoc(health))
  })

  test('직접 만든 이유는 이름 변경·비활성화만 가능하고 삭제할 수 없다', async () => {
    const alice = environment.authenticatedContext('alice').firestore()
    const custom = doc(alice, 'users/alice/reasonTags/custom-test')
    const now = Timestamp.now()
    await assertSucceeds(setDoc(custom, { label: '운동', active: true, builtIn: false, createdAt: now, updatedAt: now }))
    await assertSucceeds(updateDoc(custom, { label: '헬스', updatedAt: Timestamp.now() }))
    await assertSucceeds(updateDoc(custom, { active: false, updatedAt: Timestamp.now() }))
    await assertFails(deleteDoc(custom))
  })
})
