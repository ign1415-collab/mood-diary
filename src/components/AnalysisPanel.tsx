import { useEffect, useState, type FormEvent } from 'react'
import type { AnalysisResult, Entry, Mood, ReasonTag } from '../types'
import { calculateStats, isKnownMood, MAX_NOTE_LENGTH } from '../diaryLogic'
import { ANALYSIS_THRESHOLDS } from '../analysisConstants'
import { MOODS } from '../types'
import { MoodIcon } from './MoodIcon'
import { WeatherIcon } from './WeatherIcon'
import type { WeatherStatus } from './WeatherBadge'

interface Props {
  days: 7 | 30
  analysis: AnalysisResult | null
  hasAnyHistory: boolean | null
  loading: boolean
  saving: boolean
  reasonTags: ReasonTag[]
  weatherDemo?: boolean
  weatherStatus: WeatherStatus
  onRequestWeather: () => void
  onDaysChange: (days: 7 | 30) => void
  onStartEntry: () => void
  onUpdate: (date: string, value: { mood: Mood; note: string; reason_ids: string[] }) => Promise<boolean>
  onDelete: (date: string) => Promise<void>
}

const weekdayLabels = ['일', '월', '화', '수', '목', '금', '토']
export const weatherOrder = ['맑음', '흐림', '비', '눈'] as const
export type WeatherGroup = typeof weatherOrder[number]
export type WeatherStat = {
  group: WeatherGroup
  description: string
  count: number
  counts: Record<Mood, number>
  leadingMood: Mood | null
}

export type WeatherInsight = WeatherStat & { mood: Mood; moodCount: number; lift: number }

const moodPastTense: Record<Mood, string> = {
  happy: '행복했어요',
  calm: '평온했어요',
  excited: '설렜어요',
  neutral: '보통이었어요',
  depressed: '우울했어요',
  anxious: '불안했어요',
  tired: '피곤했어요',
  angry: '화가 났어요',
}

export function weatherSubject(group: WeatherGroup) {
  if (group === '맑음') return '맑은 날엔'
  if (group === '흐림') return '흐린 날엔'
  if (group === '비') return '비 오는 날엔'
  return '눈 오는 날엔'
}

export function weatherEvidenceLabel(group: WeatherGroup) {
  if (group === '맑음') return '맑은'
  if (group === '흐림') return '흐린'
  if (group === '비') return '비 오는'
  return '눈 오는'
}

export function findWeatherInsights(stats: WeatherStat[], overallCounts: Record<Mood, number>, total: number, moods: Mood[]) {
  if (total === 0) return []
  return stats
    .filter((stat) => stat.count >= ANALYSIS_THRESHOLDS.weatherGroupMinEntries)
    .flatMap((stat) => moods
      .filter((mood) => stat.counts[mood] >= ANALYSIS_THRESHOLDS.weatherMoodMinCount)
      .map((mood) => ({
        ...stat,
        mood,
        moodCount: stat.counts[mood],
        lift: stat.counts[mood] / stat.count - overallCounts[mood] / total,
      })))
    .filter((insight) => insight.lift > 0)
    .sort((left, right) => right.lift - left.lift
      || right.count - left.count
      || weatherOrder.indexOf(left.group) - weatherOrder.indexOf(right.group))
}

export function weatherGroup(description: string): WeatherGroup {
  if (/눈|snow/i.test(description)) return '눈'
  if (/비|소나기|rain|drizzle|thunder/i.test(description)) return '비'
  if (/흐림|구름|cloud|mist|fog/i.test(description)) return '흐림'
  return '맑음'
}

export function shiftDate(date: string, amount: number) {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + amount)
  return value.toISOString().slice(0, 10)
}

function shortDate(date: string) {
  return new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${date}T00:00:00Z`))
}

function withObjectParticle(label: string) {
  const last = label.codePointAt(label.length - 1)
  const hasFinalConsonant = last !== undefined && last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 !== 0
  return `${label}${hasFinalConsonant ? '을' : '를'}`
}

export function currentStreak(entries: Entry[], today: string) {
  const recorded = new Set(entries.map((entry) => entry.date))
  let cursor = recorded.has(today) ? today : shiftDate(today, -1)
  let streak = 0
  while (recorded.has(cursor)) {
    streak += 1
    cursor = shiftDate(cursor, -1)
  }
  return streak
}

function calculateMoodCounts(entries: Entry[], moods: Mood[]) {
  return Object.fromEntries(moods.map((mood) => [
    mood,
    entries.filter((entry) => entry.mood === mood).length,
  ])) as Record<Mood, number>
}

function localToday() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" />
    </svg>
  )
}

export function AnalysisPanel({ days, analysis, hasAnyHistory, loading, saving, reasonTags, weatherDemo = false, weatherStatus, onRequestWeather, onDaysChange, onStartEntry, onUpdate, onDelete }: Props) {
  const [selectedMood, setSelectedMood] = useState<Mood | null>(null)
  const [selectedReasonId, setSelectedReasonId] = useState<string | null>(null)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [editingDate, setEditingDate] = useState<string | null>(null)
  const [editMood, setEditMood] = useState<Mood>('neutral')
  const [editNote, setEditNote] = useState('')
  const [editReasonIds, setEditReasonIds] = useState<string[]>([])
  const [showAllRecords, setShowAllRecords] = useState(false)
  const [weatherCollapsed, setWeatherCollapsed] = useState(false)
  const [reasonsCollapsed, setReasonsCollapsed] = useState(false)
  const moods = Object.keys(MOODS) as Mood[]
  const allEntries = analysis?.entries ?? []
  const validEntries = allEntries.filter((entry) => isKnownMood(entry.mood))
  const validStats = calculateStats(validEntries)
  const visibleEntries = allEntries.filter((entry) => {
    if (days === 7) return true
    if (selectedMood) return entry.mood === selectedMood
    if (selectedReasonId) return entry.reason_ids?.includes(selectedReasonId) ?? false
    return true
  })
  const today = localToday()
  const weekDates = Array.from({ length: 7 }, (_, index) => shiftDate(today, index - 6))
  const entriesByDate = new Map(allEntries.map((entry) => [entry.date, entry]))
  const topMoodCount = analysis ? Math.max(...moods.map((mood) => validStats.moods[mood].count)) : 0
  const topMoods = analysis && topMoodCount > 0
    ? moods.filter((mood) => validStats.moods[mood].count === topMoodCount)
    : []
  const weeklyTitle = days === 7 && analysis && validStats.total >= ANALYSIS_THRESHOLDS.weeklyTitleMinDays
    ? topMoods.length === 1
      ? `${MOODS[topMoods[0]].phrase}이 많은 한 주였어요`
      : topMoods.length === 2
        ? `${topMoods.map((mood) => MOODS[mood].phrase).join('과 ')}이 많은 한 주였어요`
        : '여러 마음이 고르게 섞인 한 주였어요'
    : null
  const weeklyComparison = (() => {
    if (days !== 7 || !analysis?.comparison) return null
    const current = analysis.comparison.current.filter((entry) => isKnownMood(entry.mood))
    const previous = analysis.comparison.previous.filter((entry) => isKnownMood(entry.mood))
    if (current.length < ANALYSIS_THRESHOLDS.weeklyComparisonMinDays
      || previous.length < ANALYSIS_THRESHOLDS.weeklyComparisonMinDays) {
      return current.length > previous.length ? `지난주보다 ${current.length - previous.length}일 더 기록했어요` : null
    }
    const currentCounts = calculateMoodCounts(current, moods)
    const previousCounts = calculateMoodCounts(previous, moods)
    const differences = moods.map((mood) => ({ mood, difference: currentCounts[mood] - previousCounts[mood] }))
      .sort((left, right) => Math.abs(right.difference) - Math.abs(left.difference)
        || Number(right.difference > 0) - Number(left.difference > 0))
    const strongest = differences[0]
    if (!strongest || strongest.difference === 0) {
      return '지난주와 비슷한 한 주였어요'
    }
    const amount = Math.abs(strongest.difference)
    return `지난주보다 ${MOODS[strongest.mood].phrase}이 ${amount}일 ${strongest.difference > 0 ? '늘었어요' : '줄었어요'}`
  })()
  const streakEntries = (analysis?.streak_entries ?? validEntries).filter((entry) => isKnownMood(entry.mood))
  const streak = currentStreak(streakEntries, today)
  const sortedMoodStats = moods
    .filter((mood) => validStats.moods[mood].count > 0)
    .sort((left, right) => validStats.moods[right].count - validStats.moods[left].count)
  const monthlySummary = topMoods.length === 0
    ? '아직 집계할 수 있는 감정이 없어요'
    : topMoods.length === 1
    ? `${MOODS[topMoods[0]].phrase}이 제일 많았어요`
    : topMoods.length <= 3
      ? `${topMoods.map((mood) => MOODS[mood].label).join('과 ')}이 가장 많이 나타났어요`
      : '여러 감정이 고르게 나타났어요'
  const weatherEntries = validEntries.filter((entry) => entry.weather)
  const weatherStats = weatherOrder.map((group) => {
    const entries = weatherEntries.filter((entry) => entry.weather && weatherGroup(entry.weather.description) === group)
    const counts = Object.fromEntries(moods.map((mood) => [mood, entries.filter((entry) => entry.mood === mood).length])) as Record<Mood, number>
    const leadingMood = moods.reduce<Mood | null>((current, mood) => !current || counts[mood] > counts[current] ? mood : current, null)
    return { group, description: entries[0]?.weather?.description ?? group, count: entries.length, counts, leadingMood }
  }).filter((item) => item.count > 0)
  const demoWeatherStats = [
    { group: '맑음', description: '맑음', count: 12, counts: { happy: 6, calm: 3, excited: 2, neutral: 1, depressed: 0, anxious: 0, tired: 0, angry: 0 }, leadingMood: 'happy' },
    { group: '흐림', description: '흐림', count: 8, counts: { happy: 2, calm: 0, excited: 0, neutral: 4, depressed: 0, anxious: 1, tired: 1, angry: 0 }, leadingMood: 'neutral' },
    { group: '비', description: '비', count: 6, counts: { happy: 0, calm: 0, excited: 0, neutral: 0, depressed: 2, anxious: 0, tired: 3, angry: 1 }, leadingMood: 'tired' },
  ] satisfies Array<{ group: WeatherGroup; description: string; count: number; counts: Record<Mood, number>; leadingMood: Mood }>
  const displayedWeatherStats: WeatherStat[] = weatherDemo ? demoWeatherStats : weatherStats
  const weatherBaselineCounts = weatherDemo
    ? Object.fromEntries(moods.map((mood) => [mood, displayedWeatherStats.reduce((sum, stat) => sum + stat.counts[mood], 0)])) as Record<Mood, number>
    : calculateMoodCounts(weatherEntries, moods)
  const weatherBaselineTotal = weatherDemo
    ? Object.values(weatherBaselineCounts).reduce((sum, count) => sum + count, 0)
    : weatherEntries.length
  const weatherInsights = findWeatherInsights(displayedWeatherStats, weatherBaselineCounts, weatherBaselineTotal, moods)
  const primaryWeatherInsight: WeatherInsight | null = weatherInsights[0]?.lift >= ANALYSIS_THRESHOLDS.weatherInsightMinLift ? weatherInsights[0] : null
  const secondaryWeatherInsight = primaryWeatherInsight
    ? weatherInsights.find((insight) => insight.group !== primaryWeatherInsight.group)
    : null
  const displayedEntries = days === 30 && !showAllRecords ? visibleEntries.slice(0, ANALYSIS_THRESHOLDS.monthlyInitialRecords) : visibleEntries
  const usedReasonIds = [...new Set(validEntries.flatMap((entry) => entry.reason_ids ?? []))]
  const reasonTaggedEntries = validEntries.filter((entry) => (entry.reason_ids?.length ?? 0) > 0)
  const reasonStats = usedReasonIds.map((id) => ({
    id,
    label: reasonTags.find((tag) => tag.id === id)?.label ?? '알 수 없는 이유',
    count: validEntries.filter((entry) => entry.reason_ids?.includes(id)).length,
  })).sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, 'ko'))
  const topReasonCount = reasonStats[0]?.count ?? 0
  const reasonHeadlineCandidates = moods.flatMap((mood) => {
    const moodEntries = validEntries.filter((entry) => entry.mood === mood)
    if (moodEntries.length < 4) return []
    return reasonStats.map((reason) => {
      const count = moodEntries.filter((entry) => entry.reason_ids?.includes(reason.id)).length
      return { mood, moodTotal: moodEntries.length, reason, count, ratio: count / moodEntries.length }
    }).filter((candidate) => candidate.count > 0 && candidate.ratio >= .5)
  }).sort((left, right) => right.ratio - left.ratio || right.count - left.count)
  const reasonHeadline = reasonHeadlineCandidates[0]
  const topReason = reasonStats[0]

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

  useEffect(() => setOpenMenu(null), [days, selectedMood, selectedReasonId])
  useEffect(() => {
    setSelectedMood(null)
    setSelectedReasonId(null)
    setShowAllRecords(false)
  }, [days])

  function startEditing(entry: AnalysisResult['entries'][number]) {
    setOpenMenu(null)
    setEditingDate(entry.date)
    setEditMood(isKnownMood(entry.mood) ? entry.mood : 'neutral')
    setEditNote(entry.note)
    setEditReasonIds(entry.reason_ids ?? [])
  }

  async function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingDate) return
    if (await onUpdate(editingDate, { mood: editMood, note: editNote, reason_ids: editReasonIds })) setEditingDate(null)
  }

  if (loading || !analysis || analysis.days !== days) {
    return (
      <div className="analysis-content analysis-loading">
        <div className="analysis-period-switch" aria-label="분석 기간">
          <button type="button" className={days === 7 ? 'active' : ''} onClick={() => onDaysChange(7)}>최근 7일</button>
          <button type="button" className={days === 30 ? 'active' : ''} onClick={() => onDaysChange(30)}>최근 30일</button>
        </div>
        <section className="analysis-loading-card" role="status" aria-live="polite">
          <span className="analysis-loading-mark" aria-hidden="true" />
          <p>분석을 불러오고 있어요.</p>
        </section>
      </div>
    )
  }

  if (validStats.total === 0 && allEntries.length === 0) {
    const firstEver = hasAnyHistory === false
    const title = firstEver
      ? '첫 마음을 기다리고 있어요'
      : days === 7 ? '이번 주의 첫 마음을 기다리고 있어요' : '이번 달의 첫 마음을 기다리고 있어요'

    return (
      <div className="analysis-content analysis-empty">
        <div className="analysis-period-switch" aria-label="분석 기간">
          <button type="button" className={days === 7 ? 'active' : ''} onClick={() => onDaysChange(7)}>최근 7일</button>
          <button type="button" className={days === 30 ? 'active' : ''} onClick={() => onDaysChange(30)}>최근 30일</button>
        </div>

        <section className="analysis-welcome-card">
          <h2>{title}</h2>
          <p>하루에 하나씩 기록하면, 이 칸들이 그날의 감정색으로 채워져요.</p>
          <div className="welcome-week-strip" aria-label="기록을 기다리는 최근 7일">
            {weekDates.map((date) => {
              const value = new Date(`${date}T00:00:00Z`)
              const isToday = date === today
              return (
                <div className={`welcome-week-day ${isToday ? 'today' : ''}`} key={date}>
                  <span>{isToday ? '오늘' : weekdayLabels[value.getUTCDay()]}</span>
                  <strong>{value.getUTCDate()}</strong>
                </div>
              )
            })}
          </div>
          <button type="button" className="start-entry-button" onClick={onStartEntry}>오늘 마음 기록하기 <span aria-hidden="true">→</span></button>
        </section>
      </div>
    )
  }

  return (
    <div className="analysis-content">
      {days === 7 ? (
        <>
          <div className="analysis-period-switch" aria-label="분석 기간">
            <button type="button" className="active" onClick={() => onDaysChange(7)}>최근 7일</button>
            <button type="button" onClick={() => onDaysChange(30)}>최근 30일</button>
          </div>

          <section className="analysis-checkin-card" aria-label="기록 횟수">
            <span className="analysis-star" aria-hidden="true"><StarIcon /></span>
            <div>
              <strong>최근 7일 중 {validStats.total}일을 기록했어요</strong>
              <p>{streak === 7 ? '최근 7일을 빠짐없이 기록했어요.' : streak >= 2 ? `지금 ${streak}일째 이어서 기록하고 있어요.` : streak === 1 ? '오늘의 마음을 기록했어요.' : '오늘의 마음부터 천천히 남겨보세요.'}</p>
            </div>
          </section>

          <section className="analysis-week-card" aria-label="최근 7일 감정">
            <p className="analysis-range">{shortDate(weekDates[0])} - {shortDate(weekDates[6])}</p>
            {weeklyTitle && <h2>{weeklyTitle}</h2>}
            {weeklyComparison && <p className="analysis-week-comparison">{weeklyComparison}</p>}
            <div className="week-strip">
              {weekDates.map((date) => {
                const entry = entriesByDate.get(date)
                const mood = entry && isKnownMood(entry.mood) ? MOODS[entry.mood] : null
                const value = new Date(`${date}T00:00:00Z`)
                return (
                  <div className={`week-day ${entry ? 'recorded' : ''} ${entry && !mood ? 'unknown' : ''} ${date === today ? 'today' : ''}`} key={date}>
                    <span>{weekdayLabels[value.getUTCDay()]}</span>
                    <strong style={mood ? { background: mood.color, color: mood.text } : undefined}>{value.getUTCDate()}</strong>
                    <small>{entry && !mood ? '알 수 없음' : mood?.label ?? ''}</small>
                  </div>
                )
              })}
            </div>
          </section>
        </>
      ) : (
        <>
          <div className="analysis-period-switch" aria-label="분석 기간">
            <button type="button" onClick={() => onDaysChange(7)}>최근 7일</button>
            <button type="button" className="active" onClick={() => onDaysChange(30)}>최근 30일</button>
          </div>

          <section className="analysis-checkin-card" aria-label="기록 횟수">
            <span className="analysis-star" aria-hidden="true"><StarIcon /></span>
            <div>
              <strong>최근 30일 중 {validStats.total}일을 기록했어요</strong>
              <p>{streak >= 30 ? '최근 30일을 빠짐없이 기록했어요.' : streak >= 2 ? `지금 ${streak}일째 이어서 기록하고 있어요.` : streak === 1 ? '오늘의 마음을 기록했어요.' : '다시 기록을 시작해도 괜찮아요.'}</p>
            </div>
          </section>

          <section className="analysis-month-card" aria-label="최근 30일 감정 요약">
            <p>30일 동안 {validStats.total}번 기록했어요</p>
            <h2>{monthlySummary}</h2>
            <div className="mood-ratio-bar" aria-label="감정별 기록 비율">
              {sortedMoodStats.map((mood) => (
                <span key={mood} style={{ flex: validStats.moods[mood].count, background: MOODS[mood].color }} title={`${MOODS[mood].label} ${validStats.moods[mood].count}회`} />
              ))}
            </div>
            <div className="mood-ratio-legend">
              {sortedMoodStats.map((mood) => (
                <button
                  type="button"
                  key={mood}
                  className={selectedMood === mood ? 'active' : ''}
                  onClick={() => { setSelectedMood(selectedMood === mood ? null : mood); setSelectedReasonId(null); setShowAllRecords(false) }}
                >
                  <span><i style={{ background: MOODS[mood].color }} />{MOODS[mood].label}</span>
                  <strong>{validStats.moods[mood].count}회</strong>
                </button>
              ))}
            </div>
          </section>

          <section className="analysis-weather-card" aria-label="날씨별 기분">
            <div className="analysis-collapsible-heading">
              <p>날씨별 기분{weatherDemo && <span className="analysis-demo-label">미리보기</span>}</p>
              <button type="button" aria-expanded={!weatherCollapsed} aria-controls="weather-analysis-details" onClick={() => setWeatherCollapsed((collapsed) => !collapsed)}>
                {weatherCollapsed ? '펼치기' : '접기'} <span aria-hidden="true">{weatherCollapsed ? '▾' : '▴'}</span>
              </button>
            </div>
            {weatherDemo || weatherEntries.length >= ANALYSIS_THRESHOLDS.weatherAnalysisMinEntries ? (
              <>
                <h2>{primaryWeatherInsight
                  ? `${weatherSubject(primaryWeatherInsight.group)} ${MOODS[primaryWeatherInsight.mood].phrase}이 많았어요`
                  : '날씨에 따른 뚜렷한 차이는 아직 없어요'}</h2>
                <div id="weather-analysis-details" hidden={weatherCollapsed}>
                  <div className="weather-patterns">
                    {displayedWeatherStats.map(({ group, description, count, counts, leadingMood }) => (
                      <div className="weather-pattern" key={group}>
                        <span><WeatherIcon description={description} size={15} />{group} {count}일</span>
                        <div className="weather-ratio-bar">
                          {moods.filter((mood) => counts[mood] > 0).map((mood) => (
                            <i key={mood} style={{ flex: counts[mood], background: MOODS[mood].color }} />
                          ))}
                        </div>
                        <strong>{leadingMood ? MOODS[leadingMood].label : ''}</strong>
                      </div>
                    ))}
                  </div>
                  {primaryWeatherInsight && (
                    <div className="weather-insight-evidence">
                      <p>
                        <i style={{ background: MOODS[primaryWeatherInsight.mood].color }} />
                        <span>{weatherEvidenceLabel(primaryWeatherInsight.group)} {primaryWeatherInsight.count}일 중 {primaryWeatherInsight.moodCount}일이 {moodPastTense[primaryWeatherInsight.mood]}. 전체 기록에서는 {weatherBaselineTotal}일 중 {weatherBaselineCounts[primaryWeatherInsight.mood]}일이 {moodPastTense[primaryWeatherInsight.mood]}.</span>
                      </p>
                      {secondaryWeatherInsight && (
                        <p>
                          <i style={{ background: MOODS[secondaryWeatherInsight.mood].color }} />
                          <span>{weatherEvidenceLabel(secondaryWeatherInsight.group)} {secondaryWeatherInsight.count}일 중 {secondaryWeatherInsight.moodCount}일은 {moodPastTense[secondaryWeatherInsight.mood]}.</span>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                {weatherCollapsed && <h2>{weatherStatus === 'location-error' ? '위치를 허용하면 날씨도 함께 기록돼요' : `날씨 기록 ${weatherEntries.length} / ${ANALYSIS_THRESHOLDS.weatherAnalysisMinEntries}`}</h2>}
                <div id="weather-analysis-details" hidden={weatherCollapsed}>
                  {weatherStatus === 'location-error' ? (
                    <div className="analysis-weather-permission">
                      <p>위치를 허용하면 오늘 날짜의 기록을 저장할 때 날씨가 함께 저장돼요.</p>
                      <button type="button" onClick={onRequestWeather}>위치 허용하기</button>
                    </div>
                  ) : (
                    <div className="analysis-coming-soon weather-progress">
                      <strong>날씨 기록 {weatherEntries.length} / {ANALYSIS_THRESHOLDS.weatherAnalysisMinEntries}</strong>
                      <p>
                        <span>날씨는 <b>오늘 날짜의 기록</b>을 저장할 때 자동으로 함께 저장돼요.</span>
                        <span>지난 날짜의 기록에는 날씨가 저장되지 않아요.</span>
                        <span>{ANALYSIS_THRESHOLDS.weatherAnalysisMinEntries}개가 모이면 날씨와 마음의 관계를 알려드릴게요.</span>
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}
          </section>

          {reasonStats.length > 0 && (
            <section className="analysis-reasons-card" aria-label="자주 고른 이유">
              <div className="analysis-collapsible-heading">
                <p>자주 고른 이유</p>
                <button type="button" aria-expanded={!reasonsCollapsed} aria-controls="reason-analysis-details" onClick={() => setReasonsCollapsed((collapsed) => !collapsed)}>
                  {reasonsCollapsed ? '펼치기' : '접기'} <span aria-hidden="true">{reasonsCollapsed ? '▾' : '▴'}</span>
                </button>
              </div>
              {reasonTaggedEntries.length < 10 ? (
                <>
                  {reasonsCollapsed && <h2>이유 기록 {reasonTaggedEntries.length} / 10</h2>}
                  <div id="reason-analysis-details" hidden={reasonsCollapsed}>
                    <div className="analysis-coming-soon reason-progress">
                      <strong>이유 기록 {reasonTaggedEntries.length} / 10</strong>
                      <span>조금 더 쌓이면 감정과 이유의 관계를 알려드릴게요.</span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <h2>{reasonHeadline
                    ? `${MOODS[reasonHeadline.mood].phrase} ${reasonHeadline.moodTotal}일 중 ${reasonHeadline.count}일이 ${reasonHeadline.reason.label} 때문이었어요`
                    : topReason ? `${withObjectParticle(topReason.label)} 가장 자주 골랐어요` : '감정에 따라 반복되는 이유는 아직 뚜렷하지 않아요'}</h2>
                  <div id="reason-analysis-details" hidden={reasonsCollapsed}>
                    <div className="reason-analysis-list">
                      {reasonStats.map((reason) => (
                        <button
                          type="button"
                          key={reason.id}
                          className={selectedReasonId === reason.id ? 'active' : ''}
                          aria-pressed={selectedReasonId === reason.id}
                          onClick={() => {
                            setSelectedReasonId(selectedReasonId === reason.id ? null : reason.id)
                            setSelectedMood(null)
                            setShowAllRecords(false)
                          }}
                        >
                          <span>{reason.label}</span>
                          <i><b style={{ width: `${reason.count / topReasonCount * 100}%` }} /></i>
                          <strong>{reason.count}회</strong>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </section>
          )}
        </>
      )}

      <section className="analysis-records" aria-label="감정 기록 목록">
        <div className="analysis-records-heading">
          <h2>{days === 7
            ? '최근 7일 기록'
            : selectedMood
              ? `${MOODS[selectedMood].label} 기록 ${visibleEntries.length}개`
              : selectedReasonId
                ? `${reasonTags.find((tag) => tag.id === selectedReasonId)?.label ?? '이유'} 기록 ${visibleEntries.length}개`
                : `기록 ${visibleEntries.length}개`}</h2>
          {days === 30 && (selectedMood || selectedReasonId) && (
            <button type="button" onClick={() => { setSelectedMood(null); setSelectedReasonId(null); setShowAllRecords(false) }}>전체 보기</button>
          )}
        </div>
        {loading ? (
          <p>기록을 불러오고 있어요.</p>
        ) : visibleEntries.length === 0 ? (
          <p>{days === 7 && validStats.total === 0
            ? '첫 마음을 기록하면 이곳에서 한 주를 돌아볼 수 있어요.'
            : '아직 표시할 기록이 없어요.'}</p>
        ) : (
          <>
          {displayedEntries.map((entry) => {
            const knownMood = isKnownMood(entry.mood) ? entry.mood : null
            return (
            <article key={entry.date}>
              <div className={`record-mood ${knownMood ? '' : 'unknown'}`}>
                {knownMood
                  ? <MoodIcon mood={knownMood} size={24} />
                  : <span className="unknown-mood-icon" aria-hidden="true" />}
                <strong>{knownMood ? MOODS[knownMood].label : '알 수 없는 감정'}</strong>
                {!!entry.reason_ids?.length && (
                  <span className="record-reasons">
                    {entry.reason_ids.map((id) => <small key={id}>{reasonTags.find((tag) => tag.id === id)?.label ?? '알 수 없는 이유'}</small>)}
                  </span>
                )}
              </div>
              <div className="record-actions">
                {entry.weather && (
                  <span className="record-weather" title={entry.weather.location ? `${entry.weather.location} · ${entry.weather.description}` : entry.weather.description}>
                    <WeatherIcon description={entry.weather.description} size={14} />
                    {entry.weather.temperature !== undefined ? `${entry.weather.temperature}°` : ''}
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
                          <span><MoodIcon mood={mood} size={20} />{MOODS[mood].label}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <fieldset className="analysis-edit-reasons">
                    <legend>이유 <small>선택 사항</small></legend>
                    <div>
                      {reasonTags.filter((tag) => tag.active || editReasonIds.includes(tag.id)).map((tag) => (
                        <button
                          type="button"
                          key={tag.id}
                          className={editReasonIds.includes(tag.id) ? 'selected' : ''}
                          aria-pressed={editReasonIds.includes(tag.id)}
                          onClick={() => setEditReasonIds((current) => current.includes(tag.id) ? current.filter((id) => id !== tag.id) : current.length < 8 ? [...current, tag.id] : current)}
                        >
                          {tag.label}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <label className="analysis-edit-note">
                    <span>마음 기록 <small>{editNote.length}/{MAX_NOTE_LENGTH}</small></span>
                    <textarea
                      value={editNote}
                      maxLength={MAX_NOTE_LENGTH}
                      rows={2}
                      spellCheck={false}
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
            )
          })}
          {days === 30 && visibleEntries.length > ANALYSIS_THRESHOLDS.monthlyInitialRecords && (
            <button type="button" className="show-more-records" onClick={() => setShowAllRecords(!showAllRecords)}>
              {showAllRecords ? '접기' : `더 보기 (${visibleEntries.length - ANALYSIS_THRESHOLDS.monthlyInitialRecords}개)`}
            </button>
          )}
          </>
        )}
      </section>

    </div>
  )
}
