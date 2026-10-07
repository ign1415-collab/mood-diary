import express from 'express'
import { isValidDate, isValidMonth, MOODS, todayLocal, validateEntry } from './store.js'

export function createApp(store) {
  const app = express()
  app.use(express.json({ limit: '2mb' }))

  const badRequest = (res, message) => res.status(400).json({ error: message })
  const toPublicEntry = ({ intensity: _legacyIntensity, ...entry }) => entry

  app.get('/api/health', (_req, res) => res.json({ ok: true }))

  app.get('/api/analysis', (req, res) => {
    const days = Number(req.query.days)
    if (![7, 30].includes(days)) return badRequest(res, '분석 기간은 7일 또는 30일이어야 합니다.')
    const endDate = todayLocal()
    const start = new Date(`${endDate}T00:00:00Z`)
    start.setUTCDate(start.getUTCDate() - days + 1)
    const startDate = start.toISOString().slice(0, 10)
    const entries = store.listRange(startDate, endDate)
    const counts = Object.fromEntries(MOODS.map((mood) => [mood, 0]))
    for (const entry of entries) counts[entry.mood] += 1
    const moods = Object.fromEntries(MOODS.map((mood) => [mood, {
      count: counts[mood],
      percentage: entries.length ? Math.round((counts[mood] / entries.length) * 100) : 0,
    }]))
    res.json({ analysis: { days, total: entries.length, moods, entries: entries.map(toPublicEntry) } })
  })

  app.get('/api/entries', (req, res) => {
    if (!isValidMonth(req.query.month)) return badRequest(res, '조회할 월을 확인해 주세요.')
    res.json({ entries: store.listMonth(req.query.month).map(toPublicEntry) })
  })

  app.get('/api/entries/:date', (req, res) => {
    if (!isValidDate(req.params.date)) return badRequest(res, '날짜를 확인해 주세요.')
    const entry = store.get(req.params.date)
    res.json({ entry: entry ? toPublicEntry(entry) : null })
  })

  app.put('/api/entries/:date', (req, res) => {
    if (!isValidDate(req.params.date)) return badRequest(res, '오늘 또는 과거 날짜를 선택해 주세요.')
    const validationError = validateEntry(req.body)
    if (validationError) return badRequest(res, validationError)
    const entry = store.save(req.params.date, req.body)
    res.json({ entry: toPublicEntry(entry) })
  })

  app.delete('/api/entries/:date', (req, res) => {
    if (!isValidDate(req.params.date)) return badRequest(res, '날짜를 확인해 주세요.')
    if (!store.remove(req.params.date)) return res.status(404).json({ error: '삭제할 기록이 없습니다.' })
    res.status(204).end()
  })

  app.get('/api/stats', (req, res) => {
    if (!isValidMonth(req.query.month)) return badRequest(res, '조회할 월을 확인해 주세요.')
    const entries = store.listMonth(req.query.month)
    const counts = Object.fromEntries(MOODS.map((mood) => [mood, 0]))
    for (const entry of entries) {
      counts[entry.mood] += 1
    }
    const moods = Object.fromEntries(MOODS.map((mood) => [mood, {
      count: counts[mood],
      percentage: entries.length ? Math.round((counts[mood] / entries.length) * 100) : 0,
    }]))
    res.json({
      stats: {
        total: entries.length,
        moods,
      },
    })
  })

  app.get('/api/export', (_req, res) => {
    const date = new Date().toISOString().slice(0, 10)
    res.setHeader('Content-Disposition', `attachment; filename="mood-diary-${date}.json"`)
    res.json({
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      entries: store.listAll().map(toPublicEntry),
    })
  })

  app.post('/api/import', (req, res) => {
    const backup = req.body
    if (!backup || ![1, 2].includes(backup.schemaVersion) || !Array.isArray(backup.entries)) {
      return badRequest(res, '지원하는 감정 일기 백업 파일이 아닙니다.')
    }
    const dates = new Set()
    for (const entry of backup.entries) {
      if (!isValidDate(entry?.date)) return badRequest(res, '백업에 올바르지 않은 날짜가 있습니다.')
      if (dates.has(entry.date)) return badRequest(res, '백업에 같은 날짜의 기록이 중복되어 있습니다.')
      dates.add(entry.date)
      const validationError = validateEntry(entry)
      if (validationError) return badRequest(res, validationError)
      if (typeof entry.created_at !== 'string' || Number.isNaN(Date.parse(entry.created_at))
        || typeof entry.updated_at !== 'string' || Number.isNaN(Date.parse(entry.updated_at))) {
        return badRequest(res, '백업의 기록 시각이 올바르지 않습니다.')
      }
    }
    store.restore(backup.entries)
    res.json({ imported: backup.entries.length })
  })

  app.use((error, _req, res, _next) => {
    console.error(error)
    if (error instanceof SyntaxError) return res.status(400).json({ error: 'JSON 파일 형식이 올바르지 않습니다.' })
    res.status(500).json({ error: '처리 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.' })
  })

  return app
}
