import { useEffect, useState, type FormEvent } from 'react'
import type { AnalysisResult, Mood } from '../types'
import { MAX_NOTE_LENGTH } from '../diaryLogic'
import { MOODS } from '../types'

interface Props {
  days: 7 | 30
  analysis: AnalysisResult | null
  loading: boolean
  saving: boolean
  onDaysChange: (days: 7 | 30) => void
  onUpdate: (date: string, value: { mood: Mood; note: string }) => Promise<boolean>
  onDelete: (date: string) => Promise<void>
}

const moodEmoji: Record<Mood, string> = { happy: '😊', neutral: '🙂', depressed: '😔', angry: '😡' }

export function AnalysisPanel({ days, analysis, loading, saving, onDaysChange, onUpdate, onDelete }: Props) {
  const [selectedMood, setSelectedMood] = useState<Mood | null>(null)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [editingDate, setEditingDate] = useState<string | null>(null)
  const [editMood, setEditMood] = useState<Mood>('neutral')
  const [editNote, setEditNote] = useState('')
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

  function startEditing(entry: AnalysisResult['entries'][number]) {
    setOpenMenu(null)
    setEditingDate(entry.date)
    setEditMood(entry.mood)
    setEditNote(entry.note)
  }

  async function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingDate) return
    if (await onUpdate(editingDate, { mood: editMood, note: editNote })) setEditingDate(null)
  }

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
          <span className="analysis-total-label">전체</span><strong>{analysis?.total ?? 0}회</strong>
        </button>

        <div className="analysis-moods">
          {moods.map((mood) => (
            <button type="button" key={mood} className={selectedMood === mood ? 'active' : ''} onClick={() => setSelectedMood(mood)}>
              <span className="analysis-mood-label"><i aria-hidden="true" style={{ background: MOODS[mood].color }} />{MOODS[mood].label}</span>
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
              <div className="record-mood"><span aria-hidden="true">{moodEmoji[entry.mood]}</span><strong>{MOODS[entry.mood].label}</strong></div>
              <div className="record-actions">
                {entry.weather && (
                  <span className="record-weather" title={entry.weather.location ? `${entry.weather.location} · ${entry.weather.description}` : entry.weather.description}>
                    {entry.weather.icon}{entry.weather.temperature !== undefined ? ` ${entry.weather.temperature}°` : ''}
                  </span>
                )}
                <time dateTime={entry.date}>{new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(`${entry.date}T00:00:00Z`))}</time>
                <button type="button" className="more-button" aria-label={`${entry.date} 기록 메뉴`} aria-expanded={openMenu === entry.date} onClick={() => setOpenMenu(openMenu === entry.date ? null : entry.date)}>⋯</button>
                {openMenu === entry.date && (
                  <div className="record-menu" role="menu">
                    <button type="button" className="edit-record" role="menuitem" onClick={() => startEditing(entry)}>수정</button>
                    <button type="button" className="delete-record" role="menuitem" onClick={async () => { setOpenMenu(null); await onDelete(entry.date) }}>삭제</button>
                  </div>
                )}
              </div>
              {entry.note && <p>{entry.note}</p>}
              {editingDate === entry.date && (
                <form className="analysis-inline-editor" onSubmit={(event) => void submitEdit(event)}>
                  <fieldset>
                    <legend>기분 수정</legend>
                    <div className="analysis-edit-moods">
                      {(Object.keys(MOODS) as Mood[]).map((mood) => (
                        <label key={mood}>
                          <input type="radio" name={`edit-mood-${entry.date}`} checked={editMood === mood} onChange={() => setEditMood(mood)} />
                          <span><i aria-hidden="true">{moodEmoji[mood]}</i>{MOODS[mood].label}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <label className="analysis-edit-note">
                    <span>마음 기록 <small>{editNote.length}/{MAX_NOTE_LENGTH}</small></span>
                    <textarea
                      value={editNote}
                      maxLength={MAX_NOTE_LENGTH}
                      rows={2}
                      placeholder="어떤 하루였는지 들려주세요."
                      onChange={(event) => setEditNote(event.target.value)}
                    />
                  </label>
                  <div className="analysis-edit-actions">
                    <button type="button" onClick={() => setEditingDate(null)}>취소</button>
                    <button type="submit" disabled={saving}>{saving ? '저장 중…' : '저장'}</button>
                  </div>
                </form>
              )}
            </article>
          ))
        )}
      </section>

    </div>
  )
}
