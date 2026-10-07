import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'
import request from 'supertest'
import { createApp } from './app.js'
import { createStore, todayLocal } from './store.js'

describe('감정 일기 API', () => {
  let store
  let app

  beforeEach(() => {
    store = createStore(':memory:')
    app = createApp(store)
  })

  afterEach(() => store.close())

  test('같은 날짜의 기록은 새 행 대신 수정한다', async () => {
    await request(app).put('/api/entries/2025-01-02').send({ mood: 'happy', note: '좋은 날' }).expect(200)
    await request(app).put('/api/entries/2025-01-02').send({ mood: 'neutral', note: '수정' }).expect(200)
    const result = await request(app).get('/api/entries?month=2025-01').expect(200)
    assert.equal(result.body.entries.length, 1)
    assert.equal(result.body.entries[0].mood, 'neutral')
    assert.equal(result.body.entries[0].note, '수정')
  })

  test('잘못된 감정, 긴 메모, 미래 날짜를 거부한다', async () => {
    await request(app).put('/api/entries/2025-01-02').send({ mood: 'excited', note: '' }).expect(400)
    await request(app).put('/api/entries/2025-01-02').send({ mood: 'happy', note: '가'.repeat(101) }).expect(400)
    await request(app).put('/api/entries/2999-01-01').send({ mood: 'happy', note: '' }).expect(400)
  })

  test('월간 감정 분포를 계산한다', async () => {
    await request(app).put('/api/entries/2025-02-01').send({ mood: 'happy', note: '' })
    await request(app).put('/api/entries/2025-02-02').send({ mood: 'happy', note: '' })
    await request(app).put('/api/entries/2025-02-03').send({ mood: 'angry', note: '' })
    const result = await request(app).get('/api/stats?month=2025-02').expect(200)
    assert.equal(result.body.stats.total, 3)
    assert.equal('averageIntensity' in result.body.stats, false)
    assert.deepEqual(result.body.stats.moods.happy, { count: 2, percentage: 67 })
    assert.deepEqual(result.body.stats.moods.angry, { count: 1, percentage: 33 })
  })

  test('최근 7일과 30일 감정 분석을 제공한다', async () => {
    const today = todayLocal()
    await request(app).put(`/api/entries/${today}`).send({ mood: 'happy', note: '오늘 기록' }).expect(200)
    const result = await request(app).get('/api/analysis?days=7').expect(200)
    assert.equal(result.body.analysis.days, 7)
    assert.equal(result.body.analysis.total, 1)
    assert.equal(result.body.analysis.moods.happy.count, 1)
    assert.equal(result.body.analysis.entries[0].note, '오늘 기록')
    await request(app).get('/api/analysis?days=14').expect(400)
  })

  test('기록을 삭제한다', async () => {
    await request(app).put('/api/entries/2025-03-04').send({ mood: 'depressed', note: '' })
    await request(app).delete('/api/entries/2025-03-04').expect(204)
    const result = await request(app).get('/api/entries/2025-03-04').expect(200)
    assert.equal(result.body.entry, null)
  })

  test('유효한 백업을 전체 복원한다', async () => {
    await request(app).put('/api/entries/2025-01-01').send({ mood: 'angry', note: '이전 기록' })
    const backup = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      entries: [{
        date: '2025-04-05', mood: 'happy', note: '복원됨',
        created_at: '2025-04-05T01:00:00.000Z', updated_at: '2025-04-05T01:00:00.000Z',
      }],
    }
    await request(app).post('/api/import').send(backup).expect(200)
    assert.equal(store.listAll().length, 1)
    assert.equal(store.listAll()[0].date, '2025-04-05')
  })

  test('잘못된 백업은 기존 기록을 유지한다', async () => {
    await request(app).put('/api/entries/2025-01-01').send({ mood: 'neutral', note: '보존할 기록' })
    const invalidBackup = {
      schemaVersion: 1,
      entries: [
        { date: '2025-04-05', mood: 'happy', note: '', created_at: '2025-04-05T00:00:00Z', updated_at: '2025-04-05T00:00:00Z' },
        { date: '2025-04-06', mood: 'angry', note: '가'.repeat(101), created_at: '2025-04-05T00:00:00Z', updated_at: '2025-04-05T00:00:00Z' },
      ],
    }
    await request(app).post('/api/import').send(invalidBackup).expect(400)
    assert.equal(store.listAll().length, 1)
    assert.equal(store.listAll()[0].note, '보존할 기록')
  })
})
