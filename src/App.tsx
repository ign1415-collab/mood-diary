import { useCallback, useEffect, useMemo, useState } from 'react'
import { createDiaryApi } from './api'
import { AnalysisPanel } from './components/AnalysisPanel'
import { Calendar } from './components/Calendar'
import { EntryForm } from './components/EntryForm'
import { WeatherBadge, type WeatherStatus } from './components/WeatherBadge'
import { DiaryLogo } from './components/DiaryLogo'
import { calculateStats, sevenDayComparison } from './diaryLogic'
import { DEFAULT_REASON_TAGS, type AnalysisResult, type Entry, type Mood, type ReasonTag, type WeatherSnapshot } from './types'

function localDate() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

const PREVIEW_MODE = ['localhost', '127.0.0.1'].includes(window.location.hostname)
const WEATHER_DEMO = PREVIEW_MODE && new URLSearchParams(window.location.search).has('weather-demo')
type PreviewChanges = Record<string, Entry | null>

function previewStorageKey(userId: string) {
  return `mood-diary-preview:${userId}`
}

function previewReasonTagsKey(userId: string) {
  return `mood-diary-preview-reason-tags:${userId}`
}

function defaultReasonTags(): ReasonTag[] {
  const timestamp = '1970-01-01T00:00:00.000Z'
  return DEFAULT_REASON_TAGS.map(({ id, label }) => ({
    id,
    label,
    active: true,
    built_in: true,
    created_at: timestamp,
    updated_at: timestamp,
  }))
}

function readPreviewReasonTags(userId: string) {
  if (!PREVIEW_MODE) return defaultReasonTags()
  try {
    const saved = window.localStorage.getItem(previewReasonTagsKey(userId))
    if (!saved) return defaultReasonTags()
    const stored = JSON.parse(saved) as ReasonTag[]
    const byId = new Map(stored.map((tag) => [tag.id, tag]))
    const defaults = defaultReasonTags().map((tag) => byId.get(tag.id) ?? tag)
    const custom = stored.filter((tag) => !DEFAULT_REASON_TAGS.some((item) => item.id === tag.id))
    return [...defaults, ...custom]
  } catch {
    return defaultReasonTags()
  }
}

function writePreviewReasonTags(userId: string, tags: ReasonTag[]) {
  window.localStorage.setItem(previewReasonTagsKey(userId), JSON.stringify(tags))
}

function readPreviewChanges(userId: string): PreviewChanges {
  if (!PREVIEW_MODE) return {}
  try {
    const saved = window.localStorage.getItem(previewStorageKey(userId))
    return saved ? JSON.parse(saved) as PreviewChanges : {}
  } catch {
    return {}
  }
}

function writePreviewChange(userId: string, date: string, entry: Entry | null) {
  const changes = readPreviewChanges(userId)
  changes[date] = entry
  window.localStorage.setItem(previewStorageKey(userId), JSON.stringify(changes))
}

function removePreviewReason(userId: string, reasonId: string) {
  const changes = readPreviewChanges(userId)
  for (const [date, entry] of Object.entries(changes)) {
    if (!entry?.reason_ids?.includes(reasonId)) continue
    const reasonIds = entry.reason_ids.filter((id) => id !== reasonId)
    changes[date] = { ...entry, ...(reasonIds.length ? { reason_ids: reasonIds } : { reason_ids: undefined }) }
  }
  window.localStorage.setItem(previewStorageKey(userId), JSON.stringify(changes))
}

function mergePreviewEntries(userId: string, baseEntries: Entry[], includesDate: (date: string) => boolean) {
  const merged = new Map(baseEntries.map((entry) => [entry.date, entry]))
  for (const [date, entry] of Object.entries(readPreviewChanges(userId))) {
    if (!includesDate(date)) continue
    if (entry) merged.set(date, entry)
    else merged.delete(date)
  }
  return [...merged.values()]
}

function startDateForPeriod(today: string, days: 7 | 30) {
  const start = new Date(`${today}T00:00:00Z`)
  start.setUTCDate(start.getUTCDate() - days + 1)
  return start.toISOString().slice(0, 10)
}

type Notice = { kind: 'success' | 'error'; text: string } | null

type AppProps = {
  userId: string
  userEmail: string
  onSignOut: () => Promise<void> | undefined
  /** 테스트에서 날짜 경계를 고정하기 위한 값. 실제 앱에서는 전달하지 않는다. */
  todayOverride?: string
}

function NavIcon({ name }: { name: 'home' | 'analysis' }) {
  return name === 'home' ? (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 11 8-7 8 7v9h-6v-6h-4v6H4Z" /></svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20V10M12 20V4M19 20v-7" /></svg>
  )
}

export default function App({ userId, userEmail, onSignOut, todayOverride }: AppProps) {
  const api = useMemo(() => createDiaryApi(userId), [userId])
  const today = todayOverride ?? localDate()
  const [selectedDate, setSelectedDate] = useState(today)
  const [month, setMonth] = useState(today.slice(0, 7))
  const [entries, setEntries] = useState<Entry[]>([])
  const [reasonTags, setReasonTags] = useState<ReasonTag[]>(() => PREVIEW_MODE ? readPreviewReasonTags(userId) : defaultReasonTags())
  const [loading, setLoading] = useState(true)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysisDays, setAnalysisDays] = useState<7 | 30>(WEATHER_DEMO ? 30 : 7)
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [hasAnyHistory, setHasAnyHistory] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null)
  const [weatherStatus, setWeatherStatus] = useState<WeatherStatus>('loading')
  const [weatherRequestKey, setWeatherRequestKey] = useState(0)
  const [activeTab, setActiveTab] = useState<'home' | 'analysis'>(WEATHER_DEMO ? 'analysis' : 'home')
  const [noteClearKey, setNoteClearKey] = useState(0)

  const loadMonth = useCallback(async (targetMonth: string) => {
    setLoading(true)
    try {
      const cloudEntries = await api.list(targetMonth)
      const merged = PREVIEW_MODE
        ? mergePreviewEntries(userId, cloudEntries, (date) => date.startsWith(`${targetMonth}-`))
        : cloudEntries
      setEntries(merged.sort((a, b) => a.date.localeCompare(b.date)))
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : '기록을 불러오지 못했습니다.' })
    } finally {
      setLoading(false)
    }
  }, [api, userId])

  const loadAnalysis = useCallback(async (days: 7 | 30) => {
    setAnalysisLoading(true)
    try {
      const [cloudAnalysis, cloudHasAnyHistory] = await Promise.all([api.analysis(days), api.hasAnyEntries()])
      const previewHasEntry = PREVIEW_MODE && Object.values(readPreviewChanges(userId)).some((entry) => entry !== null)
      setHasAnyHistory(cloudHasAnyHistory || previewHasEntry)
      if (PREVIEW_MODE) {
        const start = startDateForPeriod(today, days)
        const streakPool = mergePreviewEntries(
          userId,
          cloudAnalysis.streak_entries ?? cloudAnalysis.comparison_pool ?? cloudAnalysis.entries,
          (date) => date <= today,
        ).sort((a, b) => b.date.localeCompare(a.date))
        if (days === 7) {
          const merged = streakPool.filter((entry) => entry.date >= start)
          setAnalysis({ days, ...calculateStats(merged), entries: merged, streak_entries: streakPool, comparison: sevenDayComparison(streakPool, today), comparison_pool: streakPool })
        } else {
          const merged = streakPool.filter((entry) => entry.date >= start)
          setAnalysis({ days, ...calculateStats(merged), entries: merged, streak_entries: streakPool })
        }
      } else {
        setAnalysis(cloudAnalysis)
      }
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : '분석을 불러오지 못했습니다.' })
    } finally {
      setAnalysisLoading(false)
    }
  }, [api, today, userId])

  const loadReasonTags = useCallback(async () => {
    if (PREVIEW_MODE) {
      setReasonTags(readPreviewReasonTags(userId))
      return
    }
    try {
      setReasonTags(await api.listReasonTags())
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : '이유 태그를 불러오지 못했습니다.' })
    }
  }, [api, userId])

  useEffect(() => { void loadMonth(month) }, [month, loadMonth])
  useEffect(() => { void loadReasonTags() }, [loadReasonTags])
  useEffect(() => {
    if (activeTab === 'analysis') void loadAnalysis(analysisDays)
  }, [activeTab, analysisDays, loadAnalysis])
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), notice.kind === 'success' ? 1500 : 4000)
    return () => window.clearTimeout(timer)
  }, [notice])

  const selectedEntry = selectedDate.slice(0, 7) === month
    ? entries.find((entry) => entry.date === selectedDate)
    : undefined

  function selectDate(date: string) {
    setSelectedDate(date)
    if (date.slice(0, 7) !== month) setMonth(date.slice(0, 7))
  }

  function startTodayEntry() {
    setSelectedDate(today)
    setMonth(today.slice(0, 7))
    setActiveTab('home')
    window.setTimeout(() => {
      document.getElementById('entry-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 0)
  }

  async function createReasonTag(label: string) {
    const normalized = label.trim()
    const existing = reasonTags.find((tag) => tag.label === normalized)
    if (existing) {
      if (!existing.active) await setReasonTagActive(existing.id, true)
      return { ...existing, active: true }
    }
    if (PREVIEW_MODE) {
      const now = new Date().toISOString()
      const created: ReasonTag = {
        id: `custom-${crypto.randomUUID()}`,
        label: normalized,
        active: true,
        built_in: false,
        created_at: now,
        updated_at: now,
      }
      setReasonTags((current) => {
        const next = [...current, created]
        writePreviewReasonTags(userId, next)
        return next
      })
      return created
    }
    const created = await api.createReasonTag(normalized)
    setReasonTags((current) => [...current, created])
    return created
  }

  async function setReasonTagActive(id: string, active: boolean) {
    if (!PREVIEW_MODE) await api.setReasonTagActive(id, active)
    setReasonTags((current) => {
      const now = new Date().toISOString()
      const next = current.map((tag) => tag.id === id ? { ...tag, active, updated_at: now } : tag)
      if (PREVIEW_MODE) writePreviewReasonTags(userId, next)
      return next
    })
  }

  async function renameReasonTag(id: string, label: string) {
    const normalized = label.trim()
    if (!PREVIEW_MODE) await api.renameReasonTag(id, normalized)
    setReasonTags((current) => {
      const now = new Date().toISOString()
      const next = current.map((tag) => tag.id === id ? { ...tag, label: normalized, updated_at: now } : tag)
      if (PREVIEW_MODE) writePreviewReasonTags(userId, next)
      return next
    })
  }

  async function deleteReasonTag(id: string) {
    if (PREVIEW_MODE) {
      removePreviewReason(userId, id)
    } else {
      await api.deleteReasonTag(id)
    }
    setReasonTags((current) => {
      const next = current.filter((tag) => tag.id !== id)
      if (PREVIEW_MODE) writePreviewReasonTags(userId, next)
      return next
    })
    await Promise.all([loadMonth(month), activeTab === 'analysis' ? loadAnalysis(analysisDays) : Promise.resolve()])
  }

  async function save(value: { mood: Mood; note: string; reason_ids: string[]; weather?: WeatherSnapshot }) {
    setSaving(true)
    try {
      const weatherToSave = selectedDate === today
        ? (!selectedEntry?.weather ? weather ?? undefined : undefined)
        : value.weather
      let savedEntry: Entry
      if (PREVIEW_MODE) {
        const now = new Date().toISOString()
        savedEntry = {
          date: selectedDate,
          mood: value.mood,
          note: value.note.trim(),
          ...(value.reason_ids.length ? { reason_ids: value.reason_ids } : {}),
          ...(weatherToSave || selectedEntry?.weather ? { weather: weatherToSave ?? selectedEntry?.weather } : {}),
          created_at: selectedEntry?.created_at ?? now,
          updated_at: now,
        }
        writePreviewChange(userId, selectedDate, savedEntry)
      } else {
        savedEntry = await api.save(selectedDate, { ...value, weather: weatherToSave })
      }
      setEntries((current) => [
        ...current.filter((entry) => entry.date !== savedEntry.date),
        savedEntry,
      ].sort((a, b) => a.date.localeCompare(b.date)))
      setNoteClearKey((key) => key + 1)
      setNotice({
        kind: 'success',
        text: PREVIEW_MODE
          ? '로컬 미리보기에 저장했습니다.'
          : selectedEntry ? '수정한 마음을 저장했습니다.' : '오늘의 마음을 저장했습니다.',
      })
      return true
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : '저장하지 못했습니다.' })
      return false
    } finally {
      setSaving(false)
    }
  }

  async function remove(date: string) {
    if (!window.confirm(`${date} 기록을 삭제할까요? 삭제한 기록은 되돌릴 수 없습니다.`)) return
    setSaving(true)
    try {
      if (PREVIEW_MODE) writePreviewChange(userId, date, null)
      else await api.remove(date)
      await Promise.all([loadMonth(month), loadAnalysis(analysisDays)])
      setNotice({ kind: 'success', text: PREVIEW_MODE ? '로컬 미리보기에서 삭제했습니다.' : '기록을 삭제했습니다.' })
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : '삭제하지 못했습니다.' })
    } finally {
      setSaving(false)
    }
  }

  async function updateFromAnalysis(date: string, value: { mood: Mood; note: string; reason_ids: string[] }) {
    setSaving(true)
    try {
      if (PREVIEW_MODE) {
        const current = analysis?.entries.find((entry) => entry.date === date)
        const now = new Date().toISOString()
        writePreviewChange(userId, date, {
          date,
          mood: value.mood,
          note: value.note.trim(),
          ...(value.reason_ids.length ? { reason_ids: value.reason_ids } : {}),
          ...(current?.weather ? { weather: current.weather } : {}),
          created_at: current?.created_at ?? now,
          updated_at: now,
        })
      } else {
        await api.save(date, value)
      }
      await Promise.all([loadAnalysis(analysisDays), loadMonth(month)])
      setNotice({ kind: 'success', text: PREVIEW_MODE ? '로컬 미리보기를 수정했습니다.' : '수정한 마음을 저장했습니다.' })
      return true
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : '수정하지 못했습니다.' })
      return false
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <DiaryLogo className="brand-logo" />
          <div><strong>MOOD DIARY</strong><span>{activeTab === 'home' ? '감정 기록' : '감정 분석'}</span></div>
        </div>
        <div className="header-info">
          <div className="header-actions">
            <button type="button" className="account-button" onClick={() => void onSignOut()} aria-label={`${userEmail} 계정에서 로그아웃`} title={`${userEmail} · 로그아웃`}>로그아웃</button>
          </div>
          <div className="header-context">
            <span className="header-date">{new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date())}</span>
            <WeatherBadge onWeatherChange={setWeather} onStatusChange={setWeatherStatus} requestKey={weatherRequestKey} />
          </div>
        </div>
      </header>

      <main>
        {activeTab === 'home' ? (
          <div className="home-page">
            <div className="home-stack">
              <Calendar month={month} entries={entries} selectedDate={selectedDate} today={today} onMonthChange={setMonth} onSelect={selectDate} />
              <EntryForm date={selectedDate} today={today} entry={selectedEntry} weather={weather} reasonTags={reasonTags} saving={saving} noteClearKey={noteClearKey} onCreateReasonTag={createReasonTag} onSetReasonTagActive={setReasonTagActive} onRenameReasonTag={renameReasonTag} onDeleteReasonTag={deleteReasonTag} onSave={save} />
            </div>
          </div>
        ) : (
          <div className="analysis-page">
            <AnalysisPanel days={analysisDays} analysis={analysis} hasAnyHistory={hasAnyHistory} loading={analysisLoading} saving={saving} reasonTags={reasonTags} weatherDemo={WEATHER_DEMO} weatherStatus={weatherStatus} onRequestWeather={() => setWeatherRequestKey((key) => key + 1)} onDaysChange={setAnalysisDays} onStartEntry={startTodayEntry} onUpdate={updateFromAnalysis} onDelete={remove} />
          </div>
        )}
      </main>

      {notice && <div className={`toast ${notice.kind}`} role="status">{notice.text}</div>}
      <div className="bottom-nav-backdrop" aria-hidden="true" />
      <nav className="bottom-nav" aria-label="주요 메뉴">
        <button type="button" className={activeTab === 'home' ? 'active' : ''} onClick={() => setActiveTab('home')} aria-current={activeTab === 'home' ? 'page' : undefined}><NavIcon name="home" /><span>홈</span></button>
        <button type="button" className={activeTab === 'analysis' ? 'active' : ''} onClick={() => setActiveTab('analysis')} aria-current={activeTab === 'analysis' ? 'page' : undefined}><NavIcon name="analysis" /><span>분석</span></button>
      </nav>
    </div>
  )
}
