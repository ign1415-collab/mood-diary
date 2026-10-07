import { useEffect, useState, type FormEvent } from 'react'
import type { Entry, Mood } from '../types'
import { MOODS } from '../types'

interface Props {
  date: string
  entry?: Entry
  saving: boolean
  noteClearKey: number
  onSave: (value: { mood: Mood; note: string }) => Promise<boolean>
}

export function EntryForm({ date, entry, saving, noteClearKey, onSave }: Props) {
  const [mood, setMood] = useState<Mood>('neutral')
  const [note, setNote] = useState('')

  useEffect(() => {
    setMood(entry?.mood ?? 'neutral')
    setNote('')
  }, [date, entry])

  useEffect(() => {
    if (noteClearKey > 0) setNote('')
  }, [noteClearKey])

  const formattedDate = new Intl.DateTimeFormat('ko-KR', {
    month: 'long', day: 'numeric', weekday: 'long', timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const saved = await onSave({ mood, note })
    if (saved) setNote('')
  }

  return (
    <section className="entry-card" aria-labelledby="entry-title">
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
                  <span aria-hidden="true">{key === 'happy' ? '😊' : key === 'neutral' ? '🙂' : key === 'depressed' ? '😔' : '😡'}</span>
                  <strong>{MOODS[key].label}</strong>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="note-row">
          <label className="field-label" htmlFor="note">짧은 메모</label>
          <span>{note.length}/100</span>
        </div>
        <textarea
          id="note"
          value={note}
          maxLength={100}
          rows={3}
          onChange={(event) => setNote(event.target.value)}
          placeholder="짧은 일기를 남겨보세요."
        />

        <div className="form-actions">
          <button type="submit" className="primary-button" disabled={saving}>{saving ? '저장 중…' : entry ? '수정 내용 저장' : '오늘 마음 저장'}</button>
        </div>
      </form>
    </section>
  )
}
