import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { calculateStats, isValidDate, monthAfter, sevenDayComparison, validateBackup, validateEntry } from '../src/diaryLogic.ts'
import type { Entry } from '../src/types.ts'

const timestamp = '2025-01-01T00:00:00.000Z'

describe('감정 기록 검증', () => {
  test('올바른 날짜와 다음 달을 계산한다', () => {
    assert.equal(isValidDate('2025-02-28'), true)
    assert.equal(isValidDate('2025-02-30'), false)
    assert.equal(monthAfter('2025-12'), '2026-01')
  })

  test('감정 값과 메모 300자 제한을 확인한다', () => {
    assert.equal(validateEntry({ mood: 'happy', note: '가'.repeat(300) }), null)
    assert.equal(validateEntry({ mood: 'excited', note: '' }), null)
    assert.equal(validateEntry({ mood: 'calm', note: '', reason_ids: ['sleep', 'study'] }), null)
    assert.equal(validateEntry({ mood: 'tired', note: '' }), null)
    assert.match(validateEntry({ mood: 'confused', note: '' }) ?? '', /감정/)
    assert.match(validateEntry({ mood: 'happy', note: '가'.repeat(301) }) ?? '', /300자/)
    assert.match(validateEntry({ mood: 'happy', note: '', reason_ids: ['sleep', 'sleep'] }) ?? '', /이유 태그/)
    assert.match(validateEntry({ mood: 'happy', note: '', reason_ids: Array.from({ length: 9 }, (_, index) => `tag-${index}`) }) ?? '', /이유 태그/)
    assert.equal(validateEntry({
      mood: 'happy',
      note: '',
      weather: { icon: '☀️', temperature: 18, description: '맑음', location: '제기동', observed_at: timestamp },
    }), null)
    assert.equal(validateEntry({ mood: 'happy', note: '', weather: { icon: '☁️', description: '흐림' } }), null)
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

  test('오늘 기록 여부에 따라 공평한 두 주를 비교한다', () => {
    const entry = (date: string): Entry => ({ date, mood: 'happy', note: '', created_at: timestamp, updated_at: timestamp })
    const withoutToday = sevenDayComparison([
      entry('2026-10-08'), entry('2026-10-02'), entry('2026-10-01'), entry('2026-09-25'),
    ], '2026-10-09')
    assert.deepEqual(withoutToday.current.map((item) => item.date), ['2026-10-08', '2026-10-02'])
    assert.deepEqual(withoutToday.previous.map((item) => item.date), ['2026-10-01', '2026-09-25'])

    const withToday = sevenDayComparison([
      entry('2026-10-09'), entry('2026-10-03'), entry('2026-10-02'), entry('2026-09-26'),
    ], '2026-10-09')
    assert.deepEqual(withToday.current.map((item) => item.date), ['2026-10-09', '2026-10-03'])
    assert.deepEqual(withToday.previous.map((item) => item.date), ['2026-10-02', '2026-09-26'])
  })

  test('중복 날짜나 잘못된 백업 전체를 거부한다', () => {
    const entry = { date: '2025-01-01', mood: 'happy', note: '', created_at: timestamp, updated_at: timestamp }
    assert.throws(() => validateBackup({ schemaVersion: 2, entries: [entry, entry] }), /중복/)
    assert.throws(() => validateBackup({
      schemaVersion: 2,
      entries: [{ ...entry, note: '가'.repeat(301) }],
    }), /300자/)
  })

  test('이전 백업을 버전 3으로 올리고 이유 태그를 보존한다', () => {
    const entry = { date: '2025-01-01', mood: 'calm', note: '', created_at: timestamp, updated_at: timestamp }
    const upgraded = validateBackup({ schemaVersion: 2, entries: [entry] })
    assert.equal(upgraded.schemaVersion, 3)
    assert.deepEqual(upgraded.reason_tags, [])

    const backup = validateBackup({
      schemaVersion: 3,
      entries: [{ ...entry, reason_ids: ['sleep'] }],
      reason_tags: [{ id: 'sleep', label: '잠', active: true, built_in: true, created_at: timestamp, updated_at: timestamp }],
    })
    assert.deepEqual(backup.entries[0].reason_ids, ['sleep'])
    assert.equal(backup.reason_tags[0].label, '잠')
  })
})
