import { beforeEach, describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AnalysisPanel, findWeatherInsights, shiftDate, weatherGroup, type WeatherStat } from '../src/components/AnalysisPanel'
import { calculateStats, sevenDayComparison } from '../src/diaryLogic'
import { ANALYSIS_THRESHOLDS } from '../src/analysisConstants'
import { MOODS, type AnalysisResult, type Entry, type Mood, type ReasonTag } from '../src/types'

const TODAY = '2026-10-09'
const timestamp = '2026-10-09T00:00:00.000Z'
const moods = Object.keys(MOODS) as Mood[]

function entry(date: string, mood: Mood, options: Partial<Entry> = {}): Entry {
  return { date, mood, note: '', created_at: timestamp, updated_at: timestamp, ...options }
}

function datesFrom(end: string, count: number) {
  return Array.from({ length: count }, (_, index) => shiftDate(end, index - count + 1))
}

function makeEntries(end: string, values: Mood[], options: Array<Partial<Entry>> = []) {
  const dates = datesFrom(end, values.length)
  return values.map((mood, index) => entry(dates[index], mood, options[index]))
}

function result(days: 7 | 30, entries: Entry[], comparison?: AnalysisResult['comparison'], streakEntries?: Entry[]): AnalysisResult {
  return {
    days,
    ...calculateStats(entries),
    entries: [...entries].sort((a, b) => b.date.localeCompare(a.date)),
    ...(comparison ? { comparison } : {}),
    ...(streakEntries ? { streak_entries: [...streakEntries].sort((a, b) => b.date.localeCompare(a.date)) } : {}),
  }
}

const reasonTags: ReasonTag[] = [
  { id: 'sleep', label: '잠', active: true, built_in: true, created_at: timestamp, updated_at: timestamp },
  { id: 'study', label: '공부', active: true, built_in: true, created_at: timestamp, updated_at: timestamp },
  { id: 'custom-hidden', label: '숨긴이유', active: false, built_in: false, created_at: timestamp, updated_at: timestamp },
]

function renderPanel(analysis: AnalysisResult | null, options: {
  days?: 7 | 30
  loading?: boolean
  hasAnyHistory?: boolean | null
  weatherStatus?: 'loading' | 'ready' | 'missing-key' | 'location-error' | 'api-error'
} = {}) {
  const days = options.days ?? analysis?.days ?? 7
  return render(
    <AnalysisPanel
      days={days}
      analysis={analysis}
      hasAnyHistory={options.hasAnyHistory ?? Boolean(analysis?.total)}
      loading={options.loading ?? false}
      saving={false}
      reasonTags={reasonTags}
      weatherStatus={options.weatherStatus ?? 'ready'}
      onRequestWeather={vi.fn()}
      onDaysChange={vi.fn()}
      onStartEntry={vi.fn()}
      onUpdate={vi.fn(async () => true)}
      onDelete={vi.fn(async () => undefined)}
    />,
  )
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 9, 12, 0, 0))
})

test('분석 기준 숫자는 한 상수 객체에서 관리한다', () => {
  expect(ANALYSIS_THRESHOLDS).toEqual({
    weeklyComparisonMinDays: 5,
    weeklyTitleMinDays: 3,
    weatherAnalysisMinEntries: 10,
    weatherGroupMinEntries: 4,
    weatherMoodMinCount: 2,
    weatherInsightMinLift: 0.2,
    monthlyInitialRecords: 3,
  })
})

describe('날짜 범위', () => {
  test('D1·D9 오늘 포함 최근 7일은 10/3~10/9이고 토요일부터 금요일까지다', () => {
    const entries = makeEntries(TODAY, ['happy'])
    renderPanel(result(7, entries))
    expect(screen.getByText('10월 3일 - 10월 9일')).toBeInTheDocument()
    const strip = screen.getByRole('region', { name: '최근 7일 감정' })
    expect(within(strip).getAllByText(/^[토일월화수목금]$/).map((node) => node.textContent)).toEqual(['토', '일', '월', '화', '수', '목', '금'])
  })

  test.each([
    ['D4', '2026-11-02', '2026-10-27'],
    ['D5', '2027-01-03', '2026-12-28'],
    ['D6', '2028-03-01', '2028-02-24'],
  ])('%s 달·연도·윤년 경계를 지나도 7일 시작일이 정확하다', (_, today, expected) => {
    expect(shiftDate(today, -6)).toBe(expected)
  })

  test('D3 최근 30일은 9/10~10/9다', () => {
    expect(shiftDate(TODAY, -29)).toBe('2026-09-10')
    expect(shiftDate(TODAY, -30)).toBe('2026-09-09')
  })
})

describe('최근 7일 제목과 비교 문구', () => {
  test.each([
    ['T1', ['happy', 'happy', 'happy', 'calm', 'calm', 'neutral', 'angry'] as Mood[], '행복한 날이 많은 한 주였어요'],
    ['T2·T3', ['calm', 'happy', 'calm', 'happy', 'angry', 'anxious', 'neutral'] as Mood[], '행복한 날과 평온한 날이 많은 한 주였어요'],
    ['T4', ['happy', 'happy', 'calm', 'calm', 'excited', 'excited', 'neutral'] as Mood[], '여러 마음이 고르게 섞인 한 주였어요'],
    ['T5', ['happy', 'depressed', 'tired'] as Mood[], '여러 마음이 고르게 섞인 한 주였어요'],
  ])('%s 제목 규칙을 따른다', (_, values, expected) => {
    renderPanel(result(7, makeEntries(TODAY, values)))
    expect(screen.getByRole('heading', { name: expected })).toBeInTheDocument()
  })

  test('T6 R=2이면 제목이 없다', () => {
    renderPanel(result(7, makeEntries(TODAY, ['happy', 'neutral'])))
    expect(screen.queryByText(/많은 한 주|고르게 섞인 한 주/)).not.toBeInTheDocument()
  })

  test('T7 감정별 문구가 정해진 순서와 형태다', () => {
    expect(moods.map((mood) => MOODS[mood].phrase)).toEqual([
      '행복한 날', '평온한 날', '설레는 날', '보통인 날', '우울한 날', '불안한 날', '피곤한 날', '화난 날',
    ])
  })

  test('K1 행복이 2일 늘면 비교 문구에 표시한다', () => {
    const current = makeEntries(TODAY, ['happy', 'happy', 'happy', 'calm', 'neutral', 'tired', 'angry'])
    const previous = makeEntries('2026-10-02', ['happy', 'calm', 'calm', 'neutral', 'tired', 'angry'])
    renderPanel(result(7, current, { current, previous }))
    expect(screen.getByText('지난주보다 행복한 날이 2일 늘었어요')).toBeInTheDocument()
  })

  test('K2 불안이 2일 줄면 비교 문구에 표시한다', () => {
    const current = makeEntries(TODAY, ['anxious', 'happy', 'happy', 'calm', 'neutral', 'tired'])
    const previous = makeEntries('2026-10-02', ['anxious', 'anxious', 'anxious', 'happy', 'calm', 'neutral'])
    renderPanel(result(7, current, { current, previous }))
    expect(screen.getByText('지난주보다 불안한 날이 2일 줄었어요')).toBeInTheDocument()
  })

  test('K3 감정별 수가 같으면 비슷한 한 주 문구다', () => {
    const current = makeEntries(TODAY, ['happy', 'happy', 'calm', 'neutral', 'tired'])
    const previous = makeEntries('2026-10-02', ['happy', 'happy', 'calm', 'neutral', 'tired'])
    renderPanel(result(7, current, { current, previous }))
    expect(screen.getByText('지난주와 비슷한 한 주였어요')).toBeInTheDocument()
  })

  test('K4 R=7, P=3이면 감정 비교 대신 더 기록한 날 수를 보여준다', () => {
    const current = makeEntries(TODAY, Array.from({ length: 7 }, () => 'happy' as Mood))
    const previous = makeEntries('2026-10-02', Array.from({ length: 3 }, () => 'calm' as Mood))
    renderPanel(result(7, current, { current, previous }))
    expect(screen.getByText('지난주보다 4일 더 기록했어요')).toBeInTheDocument()
    expect(screen.queryByText(/행복한 날이 \d+일 늘었어요/)).not.toBeInTheDocument()
  })

  test('K5 R=4, P=7이면 비교 한 줄을 보여주지 않는다', () => {
    const current = makeEntries(TODAY, Array.from({ length: 4 }, () => 'happy' as Mood))
    const previous = makeEntries('2026-10-02', Array.from({ length: 7 }, () => 'calm' as Mood))
    renderPanel(result(7, current, { current, previous }))
    expect(screen.queryByText(/지난주|덜 기록했어요/)).not.toBeInTheDocument()
  })

  test('K8 같은 변화량이면 감소보다 증가한 감정을 먼저 고른다', () => {
    const current = makeEntries(TODAY, ['happy', 'happy', 'depressed', 'calm', 'neutral', 'tired'])
    const previous = makeEntries('2026-10-02', ['depressed', 'depressed', 'depressed', 'calm', 'neutral', 'tired'])
    renderPanel(result(7, current, { current, previous }))
    expect(screen.getByText('지난주보다 행복한 날이 2일 늘었어요')).toBeInTheDocument()
  })

  test('K8 증가 우선 규칙은 감정 버튼 순서보다 먼저 적용한다', () => {
    const current = makeEntries(TODAY, ['calm', 'calm', 'calm', 'happy', 'neutral', 'tired'])
    const previous = makeEntries('2026-10-02', ['happy', 'happy', 'happy', 'calm', 'neutral', 'tired'])
    renderPanel(result(7, current, { current, previous }))
    expect(screen.getByText('지난주보다 평온한 날이 2일 늘었어요')).toBeInTheDocument()
  })

  test('K9 같은 증가량이면 감정 버튼 순서가 빠른 감정을 고른다', () => {
    const current = makeEntries(TODAY, ['happy', 'happy', 'calm', 'calm', 'excited', 'neutral'])
    const previous = makeEntries('2026-10-02', ['excited', 'neutral', 'depressed', 'anxious', 'tired', 'angry'])
    renderPanel(result(7, current, { current, previous }))
    expect(screen.getByText('지난주보다 행복한 날이 2일 늘었어요')).toBeInTheDocument()
  })

  test('K6·K7 오늘 기록 여부에 따라 비교 기간이 이동한다', () => {
    const withoutToday = makeEntries('2026-10-08', Array.from({ length: 14 }, () => 'happy' as Mood))
    const before = sevenDayComparison(withoutToday, TODAY)
    expect(before.current.map((item) => item.date)).toContain('2026-10-02')
    expect(before.previous.map((item) => item.date)).toContain('2026-09-25')

    const after = [entry(TODAY, 'happy'), ...withoutToday]
    const compared = sevenDayComparison(after, TODAY)
    expect(compared.current.some((item) => item.date === '2026-10-03')).toBe(true)
    expect(compared.previous.some((item) => item.date === '2026-09-26')).toBe(true)
  })
})

describe('기록 횟수와 빈 상태', () => {
  test('S1 최근 7일 중 4일 기록 문구', () => {
    renderPanel(result(7, makeEntries(TODAY, ['happy', 'calm', 'neutral', 'angry'])))
    expect(screen.getByText('최근 7일 중 4일을 기록했어요')).toBeInTheDocument()
  })

  test('S2 최근 30일 중 5일 기록 문구', () => {
    renderPanel(result(30, makeEntries(TODAY, ['happy', 'calm', 'neutral', 'angry', 'tired'])))
    expect(screen.getByText('최근 30일 중 5일을 기록했어요')).toBeInTheDocument()
  })

  test('S3 오늘만 기록하면 오늘의 마음 문구', () => {
    renderPanel(result(7, [entry(TODAY, 'happy')]))
    expect(screen.getByText('오늘의 마음을 기록했어요.')).toBeInTheDocument()
  })

  test('S4 5일 연속이면 5일째 문구', () => {
    renderPanel(result(7, makeEntries(TODAY, ['happy', 'happy', 'happy', 'happy', 'happy'])))
    expect(screen.getByText('지금 5일째 이어서 기록하고 있어요.')).toBeInTheDocument()
  })

  test('S5 오늘 미기록이어도 어제까지 3일 연속이면 유지 문구를 보여준다', () => {
    renderPanel(result(7, [entry('2026-10-06', 'happy'), entry('2026-10-07', 'calm'), entry('2026-10-08', 'neutral')]))
    expect(screen.getByText('지금 3일째 이어서 기록하고 있어요.')).toBeInTheDocument()
  })

  test('S5 전체 기록이 9/27~10/9 연속이고 10/10이 미기록이면 두 탭 모두 13일로 표시한다', () => {
    vi.setSystemTime(new Date(2026, 9, 10, 12, 0, 0))
    const fullStreak = makeEntries('2026-10-09', Array.from({ length: 13 }, () => 'happy' as Mood))
    const sevenDayEntries = fullStreak.filter((item) => item.date >= '2026-10-04')

    const sevenDay = renderPanel(result(7, sevenDayEntries, undefined, fullStreak))
    expect(screen.getByText('지금 13일째 이어서 기록하고 있어요.')).toBeInTheDocument()
    sevenDay.unmount()

    renderPanel(result(30, fullStreak, undefined, fullStreak))
    expect(screen.getByText('지금 13일째 이어서 기록하고 있어요.')).toBeInTheDocument()
  })

  test('S10 9일 연속이면 7일 탭에서도 실제 9일을 표시한다', () => {
    const fullStreak = makeEntries(TODAY, Array.from({ length: 9 }, () => 'happy' as Mood))
    const sevenDayEntries = fullStreak.filter((item) => item.date >= '2026-10-03')
    renderPanel(result(7, sevenDayEntries, undefined, fullStreak))
    expect(screen.getByText('지금 9일째 이어서 기록하고 있어요.')).toBeInTheDocument()
    expect(screen.queryByText('최근 7일을 빠짐없이 기록했어요.')).not.toBeInTheDocument()
  })

  test('S11 35일 연속이면 30일 탭에서도 실제 35일을 표시한다', () => {
    const fullStreak = makeEntries(TODAY, Array.from({ length: 35 }, () => 'happy' as Mood))
    const thirtyDayEntries = fullStreak.filter((item) => item.date >= '2026-09-10')
    renderPanel(result(30, thirtyDayEntries, undefined, fullStreak))
    expect(screen.getByText('지금 35일째 이어서 기록하고 있어요.')).toBeInTheDocument()
    expect(screen.queryByText('최근 30일을 빠짐없이 기록했어요.')).not.toBeInTheDocument()
  })

  test('S6 어제와 오늘 기록이 없으면 연속·끊김 문구가 없다', () => {
    renderPanel(result(7, [entry('2026-10-05', 'happy')]))
    expect(screen.queryByText(/이어|끊겼/)).not.toBeInTheDocument()
  })

  test.each([
    ['E1', 7, false, '첫 마음을 기다리고 있어요'],
    ['E2', 7, true, '이번 주의 첫 마음을 기다리고 있어요'],
    ['E3', 30, true, '이번 달의 첫 마음을 기다리고 있어요'],
    ['E4', 30, false, '첫 마음을 기다리고 있어요'],
  ] as const)('%s 빈 상태 제목', (_, days, hasAnyHistory, title) => {
    renderPanel(result(days, []), { hasAnyHistory })
    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument()
    expect(screen.queryByText(/0일을 기록/)).not.toBeInTheDocument()
  })

  test('E6 빈 띠는 7칸이고 오늘만 오늘 표시다', () => {
    renderPanel(result(7, []), { hasAnyHistory: false })
    const strip = screen.getByLabelText('기록을 기다리는 최근 7일')
    expect(within(strip).getAllByText(/^\d+$/)).toHaveLength(7)
    expect(within(strip).getByText('오늘')).toBeInTheDocument()
  })

  test('E7 오늘 마음 기록하기는 홈 이동 콜백을 부른다', async () => {
    vi.useRealTimers()
    const onStartEntry = vi.fn()
    render(<AnalysisPanel days={7} analysis={result(7, [])} hasAnyHistory={false} loading={false} saving={false} reasonTags={[]} weatherStatus="ready" onRequestWeather={vi.fn()} onDaysChange={vi.fn()} onStartEntry={onStartEntry} onUpdate={vi.fn(async () => true)} onDelete={vi.fn(async () => undefined)} />)
    await userEvent.click(screen.getByRole('button', { name: /오늘 마음 기록하기/ }))
    expect(onStartEntry).toHaveBeenCalledOnce()
  })

  test('E8 첫 기록 뒤에는 환영 카드가 사라지고 1일 기록 문구만 보인다', () => {
    renderPanel(result(7, [entry(TODAY, 'happy')]), { hasAnyHistory: true })
    expect(screen.queryByText(/첫 마음을 기다리고 있어요/)).not.toBeInTheDocument()
    expect(screen.getByText('최근 7일 중 1일을 기록했어요')).toBeInTheDocument()
    expect(screen.queryByText(/많은 한 주|고르게 섞인 한 주/)).not.toBeInTheDocument()
  })

  test('M3 로딩 중에는 숫자가 보이지 않는다', () => {
    renderPanel(null, { days: 30, loading: true })
    expect(screen.getByText('분석을 불러오고 있어요.')).toBeInTheDocument()
    expect(screen.queryByText(/30일 동안|최근 30일 중|기록 \d+개/)).not.toBeInTheDocument()
  })
})

describe('최근 30일 요약과 필터', () => {
  function monthlyFixture() {
    return result(30, makeEntries(TODAY, ['happy', 'happy', 'neutral', 'neutral', 'depressed']))
  }

  test('M1·M2 동점 제목과 기록 있는 감정만 순서대로 표시한다', () => {
    renderPanel(monthlyFixture())
    expect(screen.getByRole('heading', { name: '행복과 보통이 가장 많이 나타났어요' })).toBeInTheDocument()
    const legend = screen.getByLabelText('감정별 기록 비율').nextElementSibling!
    expect(within(legend as HTMLElement).getAllByRole('button').map((button) => button.textContent)).toEqual(['행복2회', '보통2회', '우울1회'])
  })

  test('M4 요약·횟수·목록 숫자가 모두 같다', () => {
    renderPanel(monthlyFixture())
    expect(screen.getByText('최근 30일 중 5일을 기록했어요')).toBeInTheDocument()
    expect(screen.getByText('30일 동안 5번 기록했어요')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '기록 5개' })).toBeInTheDocument()
  })

  test('M5 기록 8개면 최신 3개와 더 보기 5개를 표시한다', () => {
    renderPanel(result(30, makeEntries(TODAY, ['happy', 'calm', 'excited', 'neutral', 'depressed', 'anxious', 'tired', 'angry'])))
    expect(screen.getAllByRole('article')).toHaveLength(3)
    expect(screen.getByRole('button', { name: '더 보기 (5개)' })).toBeInTheDocument()
  })

  test('M6 기록 3개 이하면 더 보기 버튼이 없다', () => {
    renderPanel(result(30, makeEntries(TODAY, ['happy', 'neutral', 'depressed'])))
    expect(screen.queryByRole('button', { name: /더 보기/ })).not.toBeInTheDocument()
  })

  test('M7·M8 감정 범례를 누르면 걸러지고 다시 누르면 풀린다', async () => {
    vi.useRealTimers()
    renderPanel(monthlyFixture())
    const button = screen.getByRole('button', { name: '행복2회' })
    await userEvent.click(button)
    expect(screen.getByRole('heading', { name: '행복 기록 2개' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '전체 보기' })).toBeInTheDocument()
    await userEvent.click(button)
    expect(screen.getByRole('heading', { name: '기록 5개' })).toBeInTheDocument()
  })

  test('M10 필터를 바꾸면 펼친 목록이 다시 접힌다', async () => {
    vi.useRealTimers()
    const data = result(30, makeEntries(TODAY, ['happy', 'happy', 'happy', 'happy', 'happy', 'happy', 'calm', 'calm']))
    renderPanel(data)
    await userEvent.click(screen.getByRole('button', { name: /더 보기/ }))
    expect(screen.getAllByRole('article')).toHaveLength(8)
    await userEvent.click(screen.getByRole('button', { name: '행복6회' }))
    expect(screen.getAllByRole('article')).toHaveLength(3)
  })

  test('M9 감정 필터 중 이유를 누르면 이유 하나만 적용된다', async () => {
    vi.useRealTimers()
    const values = Array.from({ length: 12 }, (_, index) => index < 6 ? 'happy' : 'neutral') as Mood[]
    const options = Array.from({ length: 12 }, (_, index) => ({ reason_ids: index % 2 === 0 ? ['sleep'] : ['study'] }))
    renderPanel(result(30, makeEntries(TODAY, values, options)))
    await userEvent.click(screen.getByRole('button', { name: '행복6회' }))
    expect(screen.getByRole('heading', { name: '행복 기록 6개' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^잠/ }))
    expect(screen.getByRole('heading', { name: '잠 기록 6개' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '행복6회' })).not.toHaveClass('active')
  })
})

describe('날씨 저장값 분류와 날씨별 분석', () => {
  const weather = (description: string) => ({ icon: 'x', description, temperature: 20, location: '서울', observed_at: timestamp })

  function weatherDataA() {
    const values: Array<[Mood, string]> = [
      ...Array.from({ length: 5 }, () => ['happy', '맑음'] as [Mood, string]),
      ...Array.from({ length: 3 }, () => ['calm', '맑음'] as [Mood, string]),
      ...Array.from({ length: 2 }, () => ['excited', '맑음'] as [Mood, string]),
      ...Array.from({ length: 2 }, () => ['neutral', '맑음'] as [Mood, string]),
      ...Array.from({ length: 4 }, () => ['neutral', '흐림'] as [Mood, string]),
      ...Array.from({ length: 2 }, () => ['happy', '흐림'] as [Mood, string]),
      ['anxious', '흐림'], ['tired', '흐림'],
      ...Array.from({ length: 3 }, () => ['tired', '비'] as [Mood, string]),
      ...Array.from({ length: 2 }, () => ['depressed', '비'] as [Mood, string]),
      ['angry', '비'],
    ]
    return values.map(([mood, description], index) => entry(shiftDate(TODAY, -index), mood, { weather: weather(description) }))
  }

  test.each([
    ['맑음', '맑음'], ['clear sky', '맑음'], ['구름 많음', '흐림'], ['mist', '흐림'],
    ['이슬비', '비'], ['thunderstorm', '비'], ['눈', '눈'], ['snow', '눈'],
  ])('W8 %s 코드를 %s으로 묶는다', (description, expected) => {
    expect(weatherGroup(description)).toBe(expected)
  })

  test('WA1·WA2 데이터 A의 제목과 실제 숫자 근거를 표시한다', () => {
    renderPanel(result(30, weatherDataA()))
    expect(screen.getByRole('heading', { name: '비 오는 날엔 피곤한 날이 많았어요' })).toBeInTheDocument()
    expect(screen.getByText('비 오는 6일 중 3일이 피곤했어요. 전체 기록에서는 26일 중 4일이 피곤했어요.')).toBeInTheDocument()
    expect(screen.getByText('흐린 8일 중 4일은 보통이었어요.')).toBeInTheDocument()
  })

  test('WA2 둘째 후보가 20%p 미만이면 근거 둘째 줄을 표시하지 않는다', () => {
    const data = [
      ...['tired', 'tired', 'happy', 'happy'].map((mood, index) => entry(shiftDate(TODAY, -index), mood as Mood, { weather: weather('비') })),
      ...['happy', 'happy', 'happy', 'happy', 'neutral', 'neutral'].map((mood, index) => entry(shiftDate(TODAY, -index - 4), mood as Mood, { weather: weather('맑음') })),
    ]
    renderPanel(result(30, data))
    expect(screen.getByRole('heading', { name: '비 오는 날엔 피곤한 날이 많았어요' })).toBeInTheDocument()
    expect(screen.queryByText('맑은 6일 중 4일은 행복했어요.')).not.toBeInTheDocument()
    expect(document.querySelectorAll('.weather-insight-evidence p')).toHaveLength(1)
  })

  test('WA3 4일 미만 날씨는 문장 후보에서 빠진다', () => {
    const data = [...weatherDataA(), entry('2026-09-13', 'happy', { weather: weather('눈') }), entry('2026-09-12', 'happy', { weather: weather('눈') })]
    renderPanel(result(30, data))
    expect(screen.getByRole('heading', { name: '비 오는 날엔 피곤한 날이 많았어요' })).toBeInTheDocument()
    expect(screen.getByText('눈 2일')).toBeInTheDocument()
  })

  test('WA4 감정이 한 번뿐인 조합은 후보가 아니다', () => {
    const counts = Object.fromEntries(moods.map((mood) => [mood, mood === 'angry' ? 1 : 0])) as Record<Mood, number>
    const stats: WeatherStat[] = [{ group: '흐림', description: '흐림', count: 4, counts, leadingMood: 'angry' }]
    const overall = Object.fromEntries(moods.map((mood) => [mood, mood === 'angry' ? 1 : 0])) as Record<Mood, number>
    expect(findWeatherInsights(stats, overall, 26, moods)).toHaveLength(0)
  })

  test('WA5 20%p 이상 후보가 없으면 차이 없음 제목이다', () => {
    const data = [
      ...['happy', 'happy', 'happy', 'neutral', 'neutral'].map((mood, index) => entry(shiftDate(TODAY, -index), mood as Mood, { weather: weather('맑음') })),
      ...['happy', 'happy', 'neutral', 'neutral', 'neutral'].map((mood, index) => entry(shiftDate(TODAY, -index - 5), mood as Mood, { weather: weather('흐림') })),
    ]
    renderPanel(result(30, data))
    expect(screen.getByRole('heading', { name: '날씨에 따른 뚜렷한 차이는 아직 없어요' })).toBeInTheDocument()
  })

  test('WA6 날씨 없는 기록은 전체 기준 숫자에서 빠진다', () => {
    const weatherless = ['2026-09-13', '2026-09-12', '2026-09-11', '2026-09-10'].map((date) => entry(date, 'tired'))
    renderPanel(result(30, [...weatherDataA(), ...weatherless]))
    expect(screen.getByText('비 오는 6일 중 3일이 피곤했어요. 전체 기록에서는 26일 중 4일이 피곤했어요.')).toBeInTheDocument()
  })

  test('WA7 날씨 기록 9개면 진행 안내만 표시한다', () => {
    const data = makeEntries(TODAY, Array.from({ length: 9 }, () => 'happy' as Mood), Array.from({ length: 9 }, () => ({ weather: weather('맑음') })))
    renderPanel(result(30, data))
    expect(screen.getByText('날씨 기록 9 / 10')).toBeInTheDocument()
    expect(screen.queryByText(/날엔 .*날이 많았어요/)).not.toBeInTheDocument()
  })

  test('WA8 날씨 기록 10개면 분석 카드가 나온다', () => {
    const data = makeEntries(TODAY, Array.from({ length: 10 }, () => 'happy' as Mood), Array.from({ length: 10 }, () => ({ weather: weather('맑음') })))
    renderPanel(result(30, data))
    expect(screen.getByText('맑음 10일')).toBeInTheDocument()
    expect(screen.queryByText('날씨 기록 10 / 10')).not.toBeInTheDocument()
  })

  test('WA9 위치 거부 상태면 권한 안내와 버튼을 표시한다', () => {
    renderPanel(result(30, makeEntries(TODAY, ['happy'])), { weatherStatus: 'location-error' })
    expect(screen.getByText('위치를 허용하면 오늘 날짜의 기록을 저장할 때 날씨가 함께 저장돼요.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '위치 허용하기' })).toBeInTheDocument()
  })

  test('WA10 10개 이상이면 현재 위치 거부여도 기존 분석을 표시한다', () => {
    const data = makeEntries(TODAY, Array.from({ length: 10 }, () => 'happy' as Mood), Array.from({ length: 10 }, () => ({ weather: weather('맑음') })))
    renderPanel(result(30, data), { weatherStatus: 'location-error' })
    expect(screen.getByText('맑음 10일')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '위치 허용하기' })).not.toBeInTheDocument()
  })

  test('WA11 같은 %p 차이면 날 수가 더 많은 비·피곤을 고른다', () => {
    const overall = Object.fromEntries(moods.map((mood) => [mood, ['calm', 'tired'].includes(mood) ? 2 : mood === 'happy' ? 6 : 0])) as Record<Mood, number>
    const clearCounts = Object.fromEntries(moods.map((mood) => [mood, mood === 'calm' ? 2 : mood === 'happy' ? 2 : 0])) as Record<Mood, number>
    const rainCounts = Object.fromEntries(moods.map((mood) => [mood, mood === 'tired' ? 3 : mood === 'happy' ? 3 : 0])) as Record<Mood, number>
    const stats: WeatherStat[] = [
      { group: '맑음', description: '맑음', count: 4, counts: clearCounts, leadingMood: 'happy' },
      { group: '비', description: '비', count: 6, counts: rainCounts, leadingMood: 'happy' },
    ]
    const insights = findWeatherInsights(stats, overall, 10, moods)
    expect(insights[0]).toMatchObject({ group: '비', mood: 'tired', moodCount: 3 })
  })

  test('W7 날씨 없는 기록은 목록에 빈 날씨 자리 없이 정렬된다', () => {
    renderPanel(result(30, [entry(TODAY, 'happy')]))
    const record = screen.getByRole('article')
    expect(record.querySelector('.record-weather')).toBeNull()
    expect(within(record).getByText('10월 9일 (금)')).toBeInTheDocument()
  })
})

describe('기존 데이터와 이유 통계', () => {
  test('분석 기록 수정에서도 선택 감정의 고유 색 변수를 사용한다', () => {
    renderPanel(result(30, [entry(TODAY, 'neutral')]))
    fireEvent.click(screen.getByRole('button', { name: `${TODAY} 기록 메뉴` }))
    fireEvent.click(screen.getByRole('menuitem', { name: '수정' }))

    const neutral = screen.getByRole('radio', { name: '보통' })
    expect(neutral).toBeChecked()
    expect(neutral.closest('label')).toHaveStyle({
      '--mood-soft': MOODS.neutral.soft,
      '--mood-text': MOODS.neutral.selectedText,
    })

    fireEvent.click(screen.getByRole('radio', { name: '불안' }))
    expect(screen.getByRole('radio', { name: '불안' })).toBeChecked()
    expect(screen.getByRole('radio', { name: '불안' }).closest('label')).toHaveStyle({
      '--mood-soft': MOODS.anxious.soft,
      '--mood-text': MOODS.anxious.selectedText,
    })
  })

  test('H1·H2 기존 neutral/depressed는 보통/우울로 표시한다', () => {
    renderPanel(result(30, makeEntries(TODAY, ['neutral', 'depressed'])))
    expect(screen.getAllByText('보통').length).toBeGreaterThan(0)
    expect(screen.getAllByText('우울').length).toBeGreaterThan(0)
  })

  test('H3 새 감정 네 개가 이름 그대로 표시된다', () => {
    renderPanel(result(30, makeEntries(TODAY, ['excited', 'calm', 'anxious', 'tired'])))
    for (const label of ['설렘', '평온', '불안', '피곤']) expect(screen.getAllByText(label).length).toBeGreaterThan(0)
  })

  test('H5 알 수 없는 감정은 앱을 멈추지 않고 목록에 회색으로 보이며 통계에서 빠진다', () => {
    const unknown = entry(TODAY, 'happy') as Entry & { mood: string }
    unknown.mood = 'unknown'
    expect(() => renderPanel(result(30, [unknown as Entry]))).not.toThrow()
    expect(screen.getByText('알 수 없는 감정')).toBeInTheDocument()
    expect(screen.getByText('30일 동안 0번 기록했어요')).toBeInTheDocument()
    expect(screen.getByText('알 수 없는 감정').closest('.record-mood')).toHaveClass('unknown')
  })

  test('R8 이유 기록이 0개면 이유 기록 진행 상황을 보여준다', () => {
    renderPanel(result(30, makeEntries(TODAY, ['happy', 'calm', 'neutral'])))
    expect(screen.getByLabelText('자주 고른 이유')).toBeInTheDocument()
    expect(screen.getByText('이유 기록 0 / 10')).toBeInTheDocument()
  })

  test('R9 감정 기록이 3개뿐이면 감정별 단정 대신 횟수 중심 문구다', () => {
    const data = makeEntries(TODAY,
      ['tired', 'tired', 'tired', 'happy', 'happy', 'neutral', 'neutral', 'calm', 'calm', 'angry', 'depressed', 'anxious'],
      Array.from({ length: 12 }, (_, index) => ({ reason_ids: index < 6 ? ['study'] : ['sleep'] })),
    )
    renderPanel(result(30, data))
    expect(screen.getByRole('heading', { name: '공부를 가장 자주 골랐어요' })).toBeInTheDocument()
  })

  test('R11 비활성 태그도 예전 기록의 이유 통계에 포함한다', () => {
    const values = Array.from({ length: 12 }, () => 'happy' as Mood)
    const options = Array.from({ length: 12 }, (_, index) => ({ reason_ids: index < 3 ? ['custom-hidden'] : ['sleep'] }))
    renderPanel(result(30, makeEntries(TODAY, values, options)))
    expect(screen.getByRole('button', { name: '숨긴이유3회' })).toBeInTheDocument()
  })
})
