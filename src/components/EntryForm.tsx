import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { Entry, Mood, WeatherSnapshot } from '../types'
import { MAX_NOTE_LENGTH } from '../diaryLogic'
import { MOODS } from '../types'

interface Props {
  date: string
  entry?: Entry
  saving: boolean
  noteClearKey: number
  onSave: (value: { mood: Mood; note: string; weather?: WeatherSnapshot }) => Promise<boolean>
}

const moodEmoji: Record<Mood, string> = { happy: '😊', neutral: '🙂', depressed: '😔', angry: '😡' }

export function EntryForm({ date, entry, saving, noteClearKey, onSave }: Props) {
  const [mood, setMood] = useState<Mood>('neutral')
  const [note, setNote] = useState('')
  const lastNoteClearKey = useRef(noteClearKey)

  useEffect(() => {
    setMood(entry?.mood ?? 'neutral')
    setNote(entry?.note ?? '')
  }, [date, entry])

  useEffect(() => {
    if (noteClearKey !== lastNoteClearKey.current) {
      lastNoteClearKey.current = noteClearKey
      setNote('')
    }
  }, [noteClearKey])

  const formattedDate = new Intl.DateTimeFormat('ko-KR', {
    month: 'long', day: 'numeric', weekday: 'long', timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const saved = await onSave({
      mood,
      note,
    })
    if (saved) setNote('')
  }

  return (
    <section className="entry-card" id="entry-editor" aria-labelledby="entry-title">
      <div className="section-heading entry-heading">
        <div>
          <h2 id="entry-title">{formattedDate}</h2>
          <p>오늘의 기분은 어때요?</p>
        </div>
      </div>

      <form onSubmit={(event) => void handleSubmit(event)}>
        <fieldset>
          <legend className="visually-hidden">오늘의 기분은 어때요?</legend>
          <div className="mood-options">
            {(Object.keys(MOODS) as Mood[]).map((key) => (
              <label className={`mood-option mood-${key}`} key={key}>
                <input type="radio" name="mood" value={key} checked={mood === key} onChange={() => setMood(key)} />
                <span className="mood-choice">
                  <span aria-hidden="true">{moodEmoji[key]}</span>
                  <strong>{MOODS[key].label}</strong>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="note-row">
          <label className="field-label" htmlFor="note">마음 기록</label>
          <span>{note.length}/{MAX_NOTE_LENGTH}</span>
        </div>
        <textarea
          id="note"
          value={note}
          maxLength={MAX_NOTE_LENGTH}
          rows={3}
          onChange={(event) => setNote(event.target.value)}
          placeholder="어떤 하루였는지 들려주세요."
        />

        <div className="form-actions">
          <button type="submit" className="primary-button" disabled={saving}>{saving ? '저장 중…' : entry ? '수정 내용 저장' : '오늘 마음 저장'}</button>
        </div>
      </form>
    </section>
  )
}
