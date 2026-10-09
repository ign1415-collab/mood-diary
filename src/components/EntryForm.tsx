import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import type { Entry, Mood, ReasonTag, WeatherSnapshot } from '../types'
import { MAX_NOTE_LENGTH, MAX_REASON_IDS, MAX_REASON_LABEL_LENGTH } from '../diaryLogic'
import { MOODS } from '../types'
import { MoodIcon } from './MoodIcon'

interface Props {
  date: string
  today: string
  entry?: Entry
  weather?: WeatherSnapshot | null
  saving: boolean
  noteClearKey: number
  reasonTags: ReasonTag[]
  onSave: (value: { mood: Mood; note: string; reason_ids: string[]; weather?: WeatherSnapshot }) => Promise<boolean>
  onCreateReasonTag: (label: string) => Promise<ReasonTag>
  onSetReasonTagActive: (id: string, active: boolean) => Promise<void>
  onRenameReasonTag: (id: string, label: string) => Promise<void>
  onDeleteReasonTag: (id: string) => Promise<void>
}

export function EntryForm({ date, today, entry, weather, saving, noteClearKey, reasonTags, onSave, onCreateReasonTag, onSetReasonTagActive, onRenameReasonTag, onDeleteReasonTag }: Props) {
  const [mood, setMood] = useState<Mood | null>(null)
  const [note, setNote] = useState('')
  const [selectedReasonIds, setSelectedReasonIds] = useState<string[]>([])
  const [reasonsOpen, setReasonsOpen] = useState(false)
  const [customOpen, setCustomOpen] = useState(false)
  const [customLabel, setCustomLabel] = useState('')
  const [managingTags, setManagingTags] = useState(false)
  const [editingTagId, setEditingTagId] = useState<string | null>(null)
  const [editingLabel, setEditingLabel] = useState('')
  const [reasonError, setReasonError] = useState('')
  const [tagSaving, setTagSaving] = useState(false)
  const [moodError, setMoodError] = useState(false)
  const lastNoteClearKey = useRef(noteClearKey)

  useEffect(() => {
    setMood(entry?.mood ?? null)
    setNote(entry?.note ?? '')
    setSelectedReasonIds(entry?.reason_ids ?? [])
    setReasonsOpen((entry?.reason_ids?.length ?? 0) > 0)
    setCustomOpen(false)
    setCustomLabel('')
    setManagingTags(false)
    setEditingTagId(null)
    setEditingLabel('')
    setReasonError('')
    setMoodError(false)
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
  const question = date === today ? '오늘의 마음은 어때요?' : '이날의 마음은 어땠어요?'
  const availableReasonTags = reasonTags.filter((tag) => tag.active || selectedReasonIds.includes(tag.id))

  function toggleReason(id: string) {
    setReasonError('')
    setSelectedReasonIds((current) => {
      if (current.includes(id)) return current.filter((reasonId) => reasonId !== id)
      if (current.length >= MAX_REASON_IDS) {
        setReasonError(`이유는 최대 ${MAX_REASON_IDS}개까지 고를 수 있어요.`)
        return current
      }
      return [...current, id]
    })
  }

  async function addCustomReason() {
    const label = customLabel.trim()
    if (!label) {
      setReasonError('이유 이름을 입력해 주세요.')
      return
    }
    if ([...label].length > MAX_REASON_LABEL_LENGTH) {
      setReasonError(`이유 이름은 ${MAX_REASON_LABEL_LENGTH}자까지 쓸 수 있어요.`)
      return
    }
    const duplicate = reasonTags.find((tag) => tag.label === label)
    if (!selectedReasonIds.includes(duplicate?.id ?? '') && selectedReasonIds.length >= MAX_REASON_IDS) {
      setReasonError(`이유는 최대 ${MAX_REASON_IDS}개까지 고를 수 있어요.`)
      return
    }
    setTagSaving(true)
    setReasonError('')
    try {
      const tag = duplicate ?? await onCreateReasonTag(label)
      if (duplicate && !duplicate.active) await onSetReasonTagActive(duplicate.id, true)
      setSelectedReasonIds((current) => current.includes(tag.id) ? current : [...current, tag.id])
      setCustomLabel('')
      setCustomOpen(false)
    } catch {
      setReasonError('이유를 추가하지 못했어요. 잠시 후 다시 해 주세요.')
    } finally {
      setTagSaving(false)
    }
  }

  async function toggleTagActive(tag: ReasonTag) {
    setTagSaving(true)
    setReasonError('')
    try {
      await onSetReasonTagActive(tag.id, !tag.active)
      if (tag.active) setSelectedReasonIds((current) => current.filter((id) => id !== tag.id))
    } catch {
      setReasonError('이유 설정을 바꾸지 못했어요. 잠시 후 다시 해 주세요.')
    } finally {
      setTagSaving(false)
    }
  }

  function startRenaming(tag: ReasonTag) {
    setEditingTagId(tag.id)
    setEditingLabel(tag.label)
    setReasonError('')
  }

  async function renameTag(tag: ReasonTag) {
    const label = editingLabel.trim()
    if (!label) {
      setReasonError('이유 이름을 입력해 주세요.')
      return
    }
    if ([...label].length > MAX_REASON_LABEL_LENGTH) {
      setReasonError(`이유 이름은 ${MAX_REASON_LABEL_LENGTH}자까지 쓸 수 있어요.`)
      return
    }
    if (reasonTags.some((item) => item.id !== tag.id && item.label === label)) {
      setReasonError('이미 같은 이름의 이유가 있어요.')
      return
    }
    setTagSaving(true)
    setReasonError('')
    try {
      await onRenameReasonTag(tag.id, label)
      setEditingTagId(null)
      setEditingLabel('')
    } catch {
      setReasonError('이유 이름을 수정하지 못했어요. 잠시 후 다시 해 주세요.')
    } finally {
      setTagSaving(false)
    }
  }

  async function deleteTag(tag: ReasonTag) {
    if (!window.confirm(`“${tag.label}” 이유를 삭제할까요? 기존 기록에서도 이 이유가 제거돼요.`)) return
    setTagSaving(true)
    setReasonError('')
    try {
      await onDeleteReasonTag(tag.id)
      setSelectedReasonIds((current) => current.filter((id) => id !== tag.id))
      if (editingTagId === tag.id) {
        setEditingTagId(null)
        setEditingLabel('')
      }
    } catch {
      setReasonError('이유를 삭제하지 못했어요. 잠시 후 다시 해 주세요.')
    } finally {
      setTagSaving(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!mood) {
      setMoodError(true)
      return
    }
    const saved = await onSave({
      mood,
      note,
      reason_ids: selectedReasonIds,
      ...(date === today && weather ? { weather } : {}),
    })
    if (saved) setNote('')
  }

  return (
    <section className="entry-card" id="entry-editor" aria-labelledby="entry-title">
      <div className="section-heading entry-heading">
        <div>
          <h2 id="entry-title">{formattedDate}</h2>
          <p>{question}</p>
        </div>
      </div>

      <form onSubmit={(event) => void handleSubmit(event)}>
        <fieldset>
          <legend className="visually-hidden">{question}</legend>
          <div className="mood-options">
            {(Object.keys(MOODS) as Mood[]).map((key) => (
              <label
                className={`mood-option mood-${key}`}
                key={key}
                style={{ '--mood-color': MOODS[key].color, '--mood-soft': MOODS[key].soft, '--mood-text': MOODS[key].selectedText } as CSSProperties}
              >
                <input type="radio" name="mood" value={key} checked={mood === key} onChange={() => { setMood(key); setMoodError(false) }} />
                <span className="mood-choice">
                  <MoodIcon mood={key} size={28} />
                  <strong>{MOODS[key].label}</strong>
                </span>
              </label>
            ))}
          </div>
          {moodError && <p className="mood-error" role="alert">기분을 하나 선택해 주세요.</p>}
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
          spellCheck={false}
          onChange={(event) => setNote(event.target.value)}
          placeholder="어떤 하루였는지 들려주세요."
        />

        <div className="reason-section">
          <button
            type="button"
            className="reason-toggle"
            aria-expanded={reasonsOpen}
            onClick={() => setReasonsOpen((open) => !open)}
          >
            <span>{reasonsOpen ? '− 이유 접기' : '+ 이유 추가'}</span>
            <small>{selectedReasonIds.length ? `${selectedReasonIds.length}개 선택` : '선택 사항'}</small>
          </button>
          {reasonsOpen && (
            <div className="reason-panel">
              <div className="reason-tags" aria-label="기분의 이유">
                {availableReasonTags.map((tag) => (
                  <button
                    type="button"
                    key={tag.id}
                    className={`reason-tag ${selectedReasonIds.includes(tag.id) ? 'selected' : ''}`}
                    aria-pressed={selectedReasonIds.includes(tag.id)}
                    onClick={() => toggleReason(tag.id)}
                  >
                    {tag.label}
                  </button>
                ))}
              </div>
              <div className="reason-tools">
                <button type="button" onClick={() => { setCustomOpen((open) => !open); setManagingTags(false); setReasonError('') }}>+ 직접 추가</button>
                <button type="button" onClick={() => { setManagingTags((open) => !open); setCustomOpen(false); setReasonError('') }}>수정·삭제</button>
              </div>
              {customOpen && (
                <div className="reason-custom-form">
                  <input
                    value={customLabel}
                    maxLength={MAX_REASON_LABEL_LENGTH}
                    aria-label="직접 추가할 이유"
                    placeholder={`최대 ${MAX_REASON_LABEL_LENGTH}자`}
                    onChange={(event) => { setCustomLabel(event.target.value); setReasonError('') }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        void addCustomReason()
                      }
                    }}
                  />
                  <button type="button" disabled={tagSaving} onClick={() => void addCustomReason()}>추가</button>
                </div>
              )}
              {managingTags && (
                <div className="reason-manage-list">
                  {reasonTags.map((tag) => (
                    <div key={tag.id}>
                      {editingTagId === tag.id ? (
                        <div className="reason-rename-form">
                          <input
                            value={editingLabel}
                            maxLength={MAX_REASON_LABEL_LENGTH}
                            aria-label={`${tag.label} 이유 이름 수정`}
                            onChange={(event) => { setEditingLabel(event.target.value); setReasonError('') }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault()
                                void renameTag(tag)
                              }
                              if (event.key === 'Escape') {
                                setEditingTagId(null)
                                setEditingLabel('')
                              }
                            }}
                          />
                          <button type="button" disabled={tagSaving} onClick={() => void renameTag(tag)}>저장</button>
                          <button type="button" disabled={tagSaving} onClick={() => { setEditingTagId(null); setEditingLabel('') }}>취소</button>
                        </div>
                      ) : (
                        <>
                          <span>{tag.label}{tag.built_in && <small>기본</small>}</span>
                          <div className="reason-manage-actions">
                            {tag.built_in ? (
                              <button type="button" disabled={tagSaving} onClick={() => void toggleTagActive(tag)}>{tag.active ? '숨기기' : '다시 표시'}</button>
                            ) : (
                              <>
                                <button type="button" disabled={tagSaving} onClick={() => startRenaming(tag)}>수정</button>
                                <button type="button" className="danger" disabled={tagSaving} onClick={() => void deleteTag(tag)}>삭제</button>
                              </>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {reasonError && <p className="reason-error" role="alert">{reasonError}</p>}
            </div>
          )}
        </div>

        <div className="form-actions">
          <button type="submit" className="primary-button" disabled={saving}>{saving ? '저장 중…' : entry ? '수정 내용 저장' : '저장하기'}</button>
        </div>
      </form>
    </section>
  )
}
