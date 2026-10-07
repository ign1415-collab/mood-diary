import type { Backup, Entry, Mood, Stats, WeatherSnapshot } from './types'

export const MOOD_VALUES: Mood[] = ['happy', 'neutral', 'depressed', 'angry']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MONTH_RE = /^\d{4}-\d{2}$/

export function todayLocal() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function isValidDate(value: unknown, allowFuture = false): value is string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  const sameDate = parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day
  return sameDate && (allowFuture || value <= todayLocal())
}

export function isValidMonth(value: string) {
  if (!MONTH_RE.test(value)) return false
  const [, month] = value.split('-').map(Number)
  return month >= 1 && month <= 12
}

export function monthAfter(month: string) {
  if (!isValidMonth(month)) throw new Error('조회할 월을 확인해 주세요.')
  const [year, number] = month.split('-').map(Number)
  return number === 12 ? `${year + 1}-01` : `${year}-${String(number + 1).padStart(2, '0')}`
}

export function validateEntry(value: unknown) {
  if (!value || typeof value !== 'object') return '기록 형식이 올바르지 않습니다.'
  const entry = value as { mood?: unknown; note?: unknown; weather?: unknown }
  if (!MOOD_VALUES.includes(entry.mood as Mood)) return '감정을 다시 선택해 주세요.'
  if (typeof entry.note !== 'string') return '메모 형식이 올바르지 않습니다.'
  if (entry.note.length > 100) return '메모는 100자까지 입력할 수 있습니다.'
  if (entry.weather !== undefined && !isValidWeather(entry.weather)) return '날씨 정보 형식이 올바르지 않습니다.'
  return null
}

function isValidWeather(value: unknown): value is WeatherSnapshot {
  if (!value || typeof value !== 'object') return false
  const weather = value as Partial<WeatherSnapshot>
  const isManual = weather.temperature === undefined
    && weather.location === undefined
    && weather.observed_at === undefined
  const isLive = typeof weather.temperature === 'number' && Number.isInteger(weather.temperature)
    && weather.temperature >= -100 && weather.temperature <= 100
    && typeof weather.location === 'string' && weather.location.length <= 100
    && typeof weather.observed_at === 'string' && !Number.isNaN(Date.parse(weather.observed_at))
  return typeof weather.icon === 'string' && weather.icon.length <= 8
    && typeof weather.description === 'string' && weather.description.length <= 100
    && (isManual || isLive)
}

export function validateBackup(value: unknown): Backup {
  if (!value || typeof value !== 'object') throw new Error('지원하는 감정 일기 백업 파일이 아닙니다.')
  const backup = value as Partial<Backup>
  if (![1, 2].includes(backup.schemaVersion ?? 0) || !Array.isArray(backup.entries)) {
    throw new Error('지원하는 감정 일기 백업 파일이 아닙니다.')
  }
  const dates = new Set<string>()
  const entries = backup.entries.map((candidate) => {
    if (!candidate || typeof candidate !== 'object') throw new Error('백업에 올바르지 않은 기록이 있습니다.')
    const entry = candidate as Entry
    if (!isValidDate(entry.date)) throw new Error('백업에 올바르지 않은 날짜가 있습니다.')
    if (dates.has(entry.date)) throw new Error('백업에 같은 날짜의 기록이 중복되어 있습니다.')
    dates.add(entry.date)
    const error = validateEntry(entry)
    if (error) throw new Error(error)
    if (typeof entry.created_at !== 'string' || Number.isNaN(Date.parse(entry.created_at))
      || typeof entry.updated_at !== 'string' || Number.isNaN(Date.parse(entry.updated_at))) {
      throw new Error('백업의 기록 시각이 올바르지 않습니다.')
    }
    return {
      date: entry.date,
      mood: entry.mood,
      note: entry.note.trim(),
      ...(entry.weather ? { weather: {
        ...entry.weather,
        ...(entry.weather.observed_at ? { observed_at: new Date(entry.weather.observed_at).toISOString() } : {}),
      } } : {}),
      created_at: new Date(entry.created_at).toISOString(),
      updated_at: new Date(entry.updated_at).toISOString(),
    }
  })
  return {
    schemaVersion: 2,
    exportedAt: typeof backup.exportedAt === 'string' ? backup.exportedAt : new Date().toISOString(),
    entries,
  }
}

export function calculateStats(entries: Entry[]): Stats {
  const counts = Object.fromEntries(MOOD_VALUES.map((mood) => [mood, 0])) as Record<Mood, number>
  for (const entry of entries) counts[entry.mood] += 1
  return {
    total: entries.length,
    moods: Object.fromEntries(MOOD_VALUES.map((mood) => [mood, {
      count: counts[mood],
      percentage: entries.length ? Math.round((counts[mood] / entries.length) * 100) : 0,
    }])) as Stats['moods'],
  }
}
