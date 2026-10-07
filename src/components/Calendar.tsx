import type { Entry } from '../types'
import { MOODS } from '../types'

interface Props {
  month: string
  entries: Entry[]
  selectedDate: string
  today: string
  onMonthChange: (month: string) => void
  onSelect: (date: string) => void
}

const weekdays = ['일', '월', '화', '수', '목', '금', '토']

function shiftMonth(month: string, amount: number) {
  const [year, value] = month.split('-').map(Number)
  const shifted = new Date(year, value - 1 + amount, 1)
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}`
}

export function Calendar({ month, entries, selectedDate, today, onMonthChange, onSelect }: Props) {
  const [year, value] = month.split('-').map(Number)
  const days = new Date(year, value, 0).getDate()
  const leading = new Date(year, value - 1, 1).getDay()
  const byDate = new Map(entries.map((entry) => [entry.date, entry]))
  const cells = Array.from({ length: Math.ceil((leading + days) / 7) * 7 }, (_, index) => {
    const day = index - leading + 1
    return day > 0 && day <= days ? day : null
  })
  const title = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long' })
    .format(new Date(year, value - 1, 1))
  const currentMonth = today.slice(0, 7)

  return (
    <section className="calendar-card" aria-labelledby="calendar-title">
      <div className="section-heading calendar-heading">
        <div>
          <h2 id="calendar-title">{title}</h2>
        </div>
        <div className="month-nav" aria-label="월 이동">
          <button type="button" className="icon-button previous" onClick={() => onMonthChange(shiftMonth(month, -1))} aria-label="이전 달" />
          <button type="button" className="icon-button next" onClick={() => onMonthChange(shiftMonth(month, 1))} disabled={month >= currentMonth} aria-label="다음 달" />
        </div>
      </div>
      <div className="calendar-grid weekdays" aria-hidden="true">
        {weekdays.map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className="calendar-grid dates">
        {cells.map((day, index) => {
          if (!day) return <span className="empty-day" key={`empty-${index}`} />
          const date = `${month}-${String(day).padStart(2, '0')}`
          const entry = byDate.get(date)
          const disabled = date > today
          const mood = entry ? MOODS[entry.mood] : null
          return (
            <button
              type="button"
              className={`date-cell ${date === selectedDate ? 'selected' : ''} ${date === today ? 'today' : ''} ${entry ? 'has-entry' : ''}`}
              key={date}
              disabled={disabled}
              onClick={() => onSelect(date)}
              aria-label={`${value}월 ${day}일${entry ? `, ${mood?.label}` : ', 기록 없음'}`}
              aria-pressed={date === selectedDate}
            >
              <span>{day}</span>
              {mood && <i className="mood-dot" style={{ background: mood.color }} aria-hidden="true" />}
            </button>
          )
        })}
      </div>
      <div className="calendar-legend" aria-label="달력 표시 안내">
        <span><i className="selected-legend" />선택한 날짜</span>
        <span><i className="today-legend" />오늘 날짜</span>
      </div>
    </section>
  )
}
