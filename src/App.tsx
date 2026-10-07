import { useCallback, useEffect, useMemo, useState } from 'react'
import { createDiaryApi } from './api'
import { AnalysisPanel } from './components/AnalysisPanel'
import { Calendar } from './components/Calendar'
import { EntryForm } from './components/EntryForm'
import { WeatherBadge } from './components/WeatherBadge'
import { DiaryLogo } from './components/DiaryLogo'
import type { AnalysisResult, Entry, Mood, WeatherSnapshot } from './types'

function localDate() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

type Notice = { kind: 'success' | 'error'; text: string } | null

type AppProps = {
  userId: string
  userEmail: string
  onSignOut: () => Promise<void> | undefined
}

export default function App({ userId, userEmail, onSignOut }: AppProps) {
  const api = useMemo(() => createDiaryApi(userId), [userId])
  const today = localDate()
  const [selectedDate, setSelectedDate] = useState(today)
  const [month, setMonth] = useState(today.slice(0, 7))
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysisDays, setAnalysisDays] = useState<7 | 30>(7)
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null)
  const [activeTab, setActiveTab] = useState<'home' | 'analysis'>('home')
  const [noteClearKey, setNoteClearKey] = useState(0)

  const loadMonth = useCallback(async (targetMonth: string) => {
    setLoading(true)
    try {
      setEntries(await api.list(targetMonth))
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : '기록을 불러오지 못했습니다.' })
    } finally {
      setLoading(false)
    }
  }, [api])

  const loadAnalysis = useCallback(async (days: 7 | 30) => {
    setAnalysisLoading(true)
    try {
      setAnalysis(await api.analysis(days))
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : '분석을 불러오지 못했습니다.' })
    } finally {
      setAnalysisLoading(false)
    }
  }, [api])

  useEffect(() => { void loadMonth(month) }, [month, loadMonth])
  useEffect(() => {
    if (activeTab === 'analysis') void loadAnalysis(analysisDays)
  }, [activeTab, analysisDays, loadAnalysis])
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 4000)
    return () => window.clearTimeout(timer)
  }, [notice])

  const selectedEntry = selectedDate.slice(0, 7) === month
    ? entries.find((entry) => entry.date === selectedDate)
    : undefined

  function selectDate(date: string) {
    setSelectedDate(date)
    if (date.slice(0, 7) !== month) setMonth(date.slice(0, 7))
  }

  async function save(value: { mood: Mood; note: string; weather?: WeatherSnapshot }) {
    setSaving(true)
    try {
      const weatherToSave = selectedDate === today
        ? (!selectedEntry?.weather ? weather ?? undefined : undefined)
        : value.weather
      await api.save(selectedDate, { ...value, weather: weatherToSave })
      await loadMonth(month)
      setNoteClearKey((key) => key + 1)
      setNotice({ kind: 'success', text: selectedEntry ? '수정한 마음을 저장했습니다.' : '오늘의 마음을 저장했습니다.' })
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
      await api.remove(date)
      await Promise.all([loadMonth(month), loadAnalysis(analysisDays)])
      setNotice({ kind: 'success', text: '기록을 삭제했습니다.' })
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : '삭제하지 못했습니다.' })
    } finally {
      setSaving(false)
    }
  }

  async function updateFromAnalysis(date: string, value: { mood: Mood; note: string }) {
    setSaving(true)
    try {
      await api.save(date, value)
      await Promise.all([loadAnalysis(analysisDays), loadMonth(month)])
      setNotice({ kind: 'success', text: '수정한 마음을 저장했습니다.' })
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
          <div><strong>MOOD DIARY</strong><span>감정 기록</span></div>
        </div>
        <div className="header-info">
          <div className="header-actions">
            <button type="button" className="account-button" onClick={() => void onSignOut()} aria-label={`${userEmail} 계정에서 로그아웃`} title={`${userEmail} · 로그아웃`}>로그아웃</button>
          </div>
          <div className="header-context">
            <span className="header-date">{new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date())}</span>
            <WeatherBadge onWeatherChange={setWeather} />
          </div>
        </div>
      </header>

      <main>
        {activeTab === 'home' ? (
          <div className="home-page">
            <div className="home-stack">
              <Calendar month={month} entries={entries} selectedDate={selectedDate} today={today} onMonthChange={setMonth} onSelect={selectDate} />
              <EntryForm date={selectedDate} entry={selectedEntry} saving={saving} noteClearKey={noteClearKey} onSave={save} />
            </div>
          </div>
        ) : (
          <div className="analysis-page">
            <AnalysisPanel days={analysisDays} analysis={analysis} loading={analysisLoading} saving={saving} onDaysChange={setAnalysisDays} onUpdate={updateFromAnalysis} onDelete={remove} />
          </div>
        )}
      </main>

      {notice && <div className={`toast ${notice.kind}`} role="status">{notice.text}</div>}
      <nav className="bottom-nav" aria-label="주요 메뉴">
        <button type="button" className={activeTab === 'home' ? 'active' : ''} onClick={() => setActiveTab('home')} aria-current={activeTab === 'home' ? 'page' : undefined}>홈</button>
        <button type="button" className={activeTab === 'analysis' ? 'active' : ''} onClick={() => setActiveTab('analysis')} aria-current={activeTab === 'analysis' ? 'page' : undefined}>분석</button>
      </nav>
    </div>
  )
}
