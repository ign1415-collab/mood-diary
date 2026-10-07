import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export const MOODS = ['happy', 'neutral', 'depressed', 'angry']

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MONTH_RE = /^\d{4}-\d{2}$/

export function todayLocal() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function isValidDate(value, { allowFuture = false } = {}) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  const sameDate = parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day
  return sameDate && (allowFuture || value <= todayLocal())
}

export function isValidMonth(value) {
  if (typeof value !== 'string' || !MONTH_RE.test(value)) return false
  const [, month] = value.split('-').map(Number)
  return month >= 1 && month <= 12
}

export function validateEntry(value) {
  if (!value || typeof value !== 'object') return '기록 형식이 올바르지 않습니다.'
  if (!MOODS.includes(value.mood)) return '감정을 다시 선택해 주세요.'
  if (typeof value.note !== 'string') return '메모 형식이 올바르지 않습니다.'
  if (value.note.length > 300) return '메모는 300자까지 입력할 수 있습니다.'
  return null
}

export function createStore(databasePath) {
  if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true })
  const db = new DatabaseSync(databasePath)
  db.exec('PRAGMA foreign_keys = ON;')
  if (databasePath !== ':memory:') db.exec('PRAGMA journal_mode = WAL;')
  db.exec(`
    CREATE TABLE IF NOT EXISTS entries (
      date TEXT PRIMARY KEY,
      mood TEXT NOT NULL CHECK (mood IN ('happy', 'neutral', 'depressed', 'angry')),
      intensity INTEGER NOT NULL CHECK (intensity BETWEEN 1 AND 5),
      note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 2000),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;
  `)

  const getByDateStmt = db.prepare('SELECT * FROM entries WHERE date = ?')
  const listByMonthStmt = db.prepare(`
    SELECT * FROM entries
    WHERE date >= ? AND date < ?
    ORDER BY date ASC
  `)
  const listAllStmt = db.prepare('SELECT * FROM entries ORDER BY date ASC')
  const listRangeStmt = db.prepare(`
    SELECT * FROM entries
    WHERE date >= ? AND date <= ?
    ORDER BY date DESC
  `)
  const upsertStmt = db.prepare(`
    INSERT INTO entries (date, mood, intensity, note, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET
      mood = excluded.mood,
      intensity = excluded.intensity,
      note = excluded.note,
      updated_at = excluded.updated_at
  `)
  const deleteStmt = db.prepare('DELETE FROM entries WHERE date = ?')
  const clearStmt = db.prepare('DELETE FROM entries')
  const insertStmt = db.prepare(`
    INSERT INTO entries (date, mood, intensity, note, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `)

  function monthBounds(month) {
    const [year, number] = month.split('-').map(Number)
    const next = number === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(number + 1).padStart(2, '0')}-01`
    return [`${month}-01`, next]
  }

  return {
    get(date) {
      return getByDateStmt.get(date) ?? null
    },
    listMonth(month) {
      return listByMonthStmt.all(...monthBounds(month))
    },
    listAll() {
      return listAllStmt.all()
    },
    listRange(startDate, endDate) {
      return listRangeStmt.all(startDate, endDate)
    },
    save(date, entry) {
      const current = getByDateStmt.get(date)
      const now = new Date().toISOString()
      upsertStmt.run(date, entry.mood, 3, entry.note.trim(), current?.created_at ?? now, now)
      return getByDateStmt.get(date)
    },
    remove(date) {
      return deleteStmt.run(date).changes > 0
    },
    restore(entries) {
      db.exec('BEGIN IMMEDIATE')
      try {
        clearStmt.run()
        for (const entry of entries) {
          insertStmt.run(
            entry.date,
            entry.mood,
            Number.isInteger(entry.intensity) ? entry.intensity : 3,
            entry.note.trim(),
            entry.created_at,
            entry.updated_at,
          )
        }
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    },
    close() {
      db.close()
    },
  }
}
