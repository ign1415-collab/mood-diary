import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { Timestamp, doc, getDoc, setDoc } from 'firebase/firestore'

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

  test('로그인한 사용자는 자신의 기록만 읽고 쓸 수 있다', async () => {
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
  })

  test('다른 사용자의 경로에는 기록을 만들 수 없다', async () => {
    const bob = environment.authenticatedContext('bob').firestore()
    await assertFails(setDoc(doc(bob, 'users/alice/diaries/main/entries/2026-10-01'), entry()))
  })

  test('잘못된 감정과 100자를 넘는 메모를 거부한다', async () => {
    const alice = environment.authenticatedContext('alice').firestore()
    await assertFails(setDoc(
      doc(alice, 'users/alice/diaries/main/entries/2026-10-01'),
      entry({ mood: 'excited' }),
    ))
    await assertFails(setDoc(
      doc(alice, 'users/alice/diaries/main/entries/2026-10-02'),
      entry({ note: '가'.repeat(101) }),
    ))
  })

  test('날짜 형식이 아닌 문서 ID를 거부한다', async () => {
    const alice = environment.authenticatedContext('alice').firestore()
    await assertFails(setDoc(doc(alice, 'users/alice/diaries/main/entries/today'), entry()))
    assert.ok(true)
  })
})
