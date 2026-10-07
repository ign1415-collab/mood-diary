import { useEffect, useState } from 'react'
import type { AnalysisResult, Mood } from '../types'
import { MOODS } from '../types'

interface Props {
  days: 7 | 30
  analysis: AnalysisResult | null
  loading: boolean
  onDaysChange: (days: 7 | 30) => void
  onDelete: (date: string) => Promise<void>
}

export function AnalysisPanel({ days, analysis, loading, onDaysChange, onDelete }: Props) {
  const [selectedMood, setSelectedMood] = useState<Mood | null>(null)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const moods = Object.keys(MOODS) as Mood[]
  const visibleEntries = analysis?.entries.filter((entry) => !selectedMood || entry.mood === selectedMood) ?? []

  useEffect(() => {
    if (!openMenu) return

    function closeOnOutsideClick(event: PointerEvent) {
      if (!(event.target as Element).closest('.record-actions')) setOpenMenu(null)
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpenMenu(null)
    }

    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [openMenu])

  useEffect(() => setOpenMenu(null), [days, selectedMood])

  return (
    <div className="analysis-content">
      <section className="analysis-card" aria-labelledby="analysis-title">
        <div className="analysis-heading">
          <h2 id="analysis-title">감정 분석</h2>
          <div className="period-switch" aria-label="분석 기간">
            <button type="button" className={days === 7 ? 'active' : ''} onClick={() => onDaysChange(7)}>최근 7일</button>
            <button type="button" className={days === 30 ? 'active' : ''} onClick={() => onDaysChange(30)}>최근 30일</button>
          </div>
        </div>

        <button type="button" className={`analysis-total ${selectedMood === null ? 'active' : ''}`} onClick={() => setSelectedMood(null)}>
          <span>전체</span><strong>{analysis?.total ?? 0}회</strong>
        </button>

        <div className="analysis-moods">
          {moods.map((mood) => (
            <button type="button" key={mood} className={selectedMood === mood ? 'active' : ''} onClick={() => setSelectedMood(mood)}>
              <span>{MOODS[mood].label}</span>
              <strong>{analysis?.moods[mood].count ?? 0}회</strong>
            </button>
          ))}
        </div>
        <p className="analysis-hint">원하는 감정을 선택하면 해당 감정의 기록을 볼 수 있어요.</p>
      </section>

      <section className="analysis-records" aria-label="감정 기록 목록">
        {loading ? (
          <p>기록을 불러오고 있어요.</p>
        ) : visibleEntries.length === 0 ? (
          <p>아직 표시할 기록이 없어요.</p>
        ) : (
          visibleEntries.map((entry) => (
            <article key={entry.date}>
              <div className="record-mood"><span aria-hidden="true">{entry.mood === 'happy' ? '😊' : entry.mood === 'neutral' ? '🙂' : entry.mood === 'depressed' ? '😔' : '😡'}</span><strong>{MOODS[entry.mood].label}</strong></div>
              <div className="record-actions">
                <time dateTime={entry.date}>{new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(`${entry.date}T00:00:00Z`))}</time>
                <button type="button" className="more-button" aria-label={`${entry.date} 기록 메뉴`} aria-expanded={openMenu === entry.date} onClick={() => setOpenMenu(openMenu === entry.date ? null : entry.date)}>⋯</button>
                {openMenu === entry.date && (
                  <div className="record-menu" role="menu">
                    <button type="button" role="menuitem" onClick={async () => { setOpenMenu(null); await onDelete(entry.date) }}>기록 삭제</button>
                  </div>
                )}
              </div>
              {entry.note && <p>{entry.note}</p>}
            </article>
          ))
        )}
      </section>

    </div>
  )
}
