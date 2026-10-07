import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { calculateStats, isValidDate, monthAfter, validateBackup, validateEntry } from '../src/diaryLogic.ts'
import type { Entry } from '../src/types.ts'

const timestamp = '2025-01-01T00:00:00.000Z'

describe('감정 기록 검증', () => {
  test('올바른 날짜와 다음 달을 계산한다', () => {
    assert.equal(isValidDate('2025-02-28'), true)
    assert.equal(isValidDate('2025-02-30'), false)
    assert.equal(monthAfter('2025-12'), '2026-01')
  })

  test('감정 값과 메모 100자 제한을 확인한다', () => {
    assert.equal(validateEntry({ mood: 'happy', note: '가'.repeat(100) }), null)
    assert.match(validateEntry({ mood: 'excited', note: '' }) ?? '', /감정/)
    assert.match(validateEntry({ mood: 'happy', note: '가'.repeat(101) }) ?? '', /100자/)
    assert.equal(validateEntry({
      mood: 'happy',
      note: '',
      weather: { icon: '☀️', temperature: 18, description: '맑음', location: '제기동', observed_at: timestamp },
    }), null)
    assert.match(validateEntry({
      mood: 'happy',
      note: '',
      weather: { icon: '☀️', temperature: 180, description: '맑음', location: '제기동', observed_at: timestamp },
    }) ?? '', /날씨/)
  })

  test('감정 횟수와 비율을 계산한다', () => {
    const entries = [
      { date: '2025-01-01', mood: 'happy' },
      { date: '2025-01-02', mood: 'happy' },
      { date: '2025-01-03', mood: 'angry' },
    ].map((entry) => ({ ...entry, note: '', created_at: timestamp, updated_at: timestamp })) as Entry[]
    const stats = calculateStats(entries)
    assert.equal(stats.total, 3)
    assert.deepEqual(stats.moods.happy, { count: 2, percentage: 67 })
    assert.deepEqual(stats.moods.angry, { count: 1, percentage: 33 })
  })

  test('중복 날짜나 잘못된 백업 전체를 거부한다', () => {
    const entry = { date: '2025-01-01', mood: 'happy', note: '', created_at: timestamp, updated_at: timestamp }
    assert.throws(() => validateBackup({ schemaVersion: 2, entries: [entry, entry] }), /중복/)
    assert.throws(() => validateBackup({
      schemaVersion: 2,
      entries: [{ ...entry, note: '가'.repeat(101) }],
    }), /100자/)
  })
})
