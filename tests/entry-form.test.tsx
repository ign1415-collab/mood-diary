import { beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EntryForm } from '../src/components/EntryForm'
import type { Entry, ReasonTag, WeatherSnapshot } from '../src/types'

const TODAY = '2026-10-09'
const timestamp = '2026-10-09T00:00:00.000Z'
const weather: WeatherSnapshot = {
  icon: '☀️', description: '맑음', temperature: 20, location: '서울', observed_at: timestamp,
}

const tags: ReasonTag[] = [
  { id: 'person', label: '사람', active: true, built_in: true, created_at: timestamp, updated_at: timestamp },
  { id: 'sleep', label: '잠', active: true, built_in: true, created_at: timestamp, updated_at: timestamp },
  { id: 'health', label: '건강', active: true, built_in: true, created_at: timestamp, updated_at: timestamp },
  { id: 'study', label: '공부', active: true, built_in: true, created_at: timestamp, updated_at: timestamp },
  { id: 'work', label: '일', active: true, built_in: true, created_at: timestamp, updated_at: timestamp },
  { id: 'custom-fight', label: '친구랑싸움', active: true, built_in: false, created_at: timestamp, updated_at: timestamp },
  { id: 'custom-hidden', label: '숨긴이유', active: false, built_in: false, created_at: timestamp, updated_at: timestamp },
]

function renderForm(options: { date?: string; entry?: Entry; weather?: WeatherSnapshot | null } = {}) {
  const callbacks = {
    onSave: vi.fn(async () => true),
    onCreateReasonTag: vi.fn(async (label: string) => ({ id: 'custom-new', label, active: true, built_in: false, created_at: timestamp, updated_at: timestamp })),
    onSetReasonTagActive: vi.fn(async () => undefined),
    onRenameReasonTag: vi.fn(async () => undefined),
  }
  const view = render(
    <EntryForm
      date={options.date ?? TODAY}
      today={TODAY}
      entry={options.entry}
      weather={options.weather === undefined ? weather : options.weather}
      saving={false}
      noteClearKey={0}
      reasonTags={tags}
      {...callbacks}
    />,
  )
  return { ...callbacks, view }
}

async function chooseMoodAndSave() {
  const user = userEvent.setup()
  await user.click(screen.getByText('행복'))
  await user.click(screen.getByRole('button', { name: '저장하기' }))
}

beforeEach(() => vi.useRealTimers())

describe('날씨 저장 전달', () => {
  test('W1 오늘 기록에는 현재 날씨를 함께 전달한다', async () => {
    const { onSave } = renderForm()
    await chooseMoodAndSave()
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ weather }))
  })

  test('W2 과거 기록에는 현재 날씨를 전달하지 않는다', async () => {
    const { onSave } = renderForm({ date: '2026-10-05' })
    await chooseMoodAndSave()
    expect(onSave.mock.calls[0][0]).not.toHaveProperty('weather')
  })

  test.each([
    ['W5 날씨 조회 실패', null],
    ['W6 위치 권한 거부', null],
  ])('%s여도 기록 자체는 저장 요청한다', async (_, unavailableWeather) => {
    const { onSave } = renderForm({ weather: unavailableWeather })
    await chooseMoodAndSave()
    expect(onSave).toHaveBeenCalledOnce()
    expect(onSave.mock.calls[0][0]).not.toHaveProperty('weather')
  })

  test('W4 날씨 없이 저장된 오늘 기록은 같은 날 다시 저장할 때 날씨를 전달한다', async () => {
    const existing: Entry = {
      date: TODAY,
      mood: 'neutral',
      note: '날씨 없이 먼저 저장',
      created_at: timestamp,
      updated_at: timestamp,
    }
    const { onSave } = renderForm({ entry: existing })
    await userEvent.click(screen.getByRole('button', { name: '수정 내용 저장' }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ weather }))
  })

  test('W4 다음 날 이후에 과거 기록을 고치면 날씨를 새로 전달하지 않는다', async () => {
    const existing: Entry = {
      date: '2026-10-08',
      mood: 'neutral',
      note: '과거 기록',
      created_at: timestamp,
      updated_at: timestamp,
    }
    const { onSave } = renderForm({ date: '2026-10-08', entry: existing })
    await userEvent.click(screen.getByRole('button', { name: '수정 내용 저장' }))
    expect(onSave.mock.calls[0][0]).not.toHaveProperty('weather')
  })
})

describe('이유 태그 입력과 관리', () => {
  test('R1 이유를 고르지 않아도 빈 ID 목록으로 저장한다', async () => {
    const { onSave } = renderForm()
    await chooseMoodAndSave()
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ reason_ids: [] }))
  })

  test('R2 잠과 공부를 고르면 ID 두 개를 저장한다', async () => {
    const user = userEvent.setup()
    const { onSave } = renderForm()
    await user.click(screen.getByRole('button', { name: /이유 추가/ }))
    await user.click(screen.getByRole('button', { name: '잠' }))
    await user.click(screen.getByRole('button', { name: '공부' }))
    await user.click(screen.getByText('행복'))
    await user.click(screen.getByRole('button', { name: '저장하기' }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ reason_ids: ['sleep', 'study'] }))
  })

  test('R3 빈 이름은 추가하지 않고 안내한다', async () => {
    const user = userEvent.setup()
    const { onCreateReasonTag } = renderForm()
    await user.click(screen.getByRole('button', { name: /이유 추가/ }))
    await user.click(screen.getByRole('button', { name: '+ 직접 추가' }))
    const form = screen.getByLabelText('직접 추가할 이유').parentElement!
    await user.click(within(form).getByRole('button', { name: '추가' }))
    expect(screen.getByText('이유 이름을 입력해 주세요.')).toBeInTheDocument()
    expect(onCreateReasonTag).not.toHaveBeenCalled()
  })

  test('R4 9글자를 입력해도 8글자까지만 전달한다', async () => {
    const user = userEvent.setup()
    const { onCreateReasonTag } = renderForm()
    await user.click(screen.getByRole('button', { name: /이유 추가/ }))
    await user.click(screen.getByRole('button', { name: '+ 직접 추가' }))
    const input = screen.getByLabelText('직접 추가할 이유')
    await user.type(input, '가나다라마바사아자')
    expect(input).toHaveValue('가나다라마바사아')
    await user.click(within(input.parentElement!).getByRole('button', { name: '추가' }))
    expect(onCreateReasonTag).toHaveBeenCalledWith('가나다라마바사아')
  })

  test('R5 비활성 태그는 새 기록 선택지에서 숨고 예전 기록에서는 보인다', async () => {
    const user = userEvent.setup()
    const first = renderForm()
    await user.click(screen.getByRole('button', { name: /이유 추가/ }))
    expect(screen.queryByRole('button', { name: '숨긴이유' })).not.toBeInTheDocument()
    first.view.unmount()

    const oldEntry: Entry = { date: TODAY, mood: 'happy', note: '', reason_ids: ['custom-hidden'], created_at: timestamp, updated_at: timestamp }
    renderForm({ entry: oldEntry })
    expect(screen.getByRole('button', { name: '숨긴이유' })).toBeInTheDocument()
  })

  test('R6 기본 건강 태그에는 숨기기만 있고 수정·삭제가 없다', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.click(screen.getByRole('button', { name: /이유 추가/ }))
    await user.click(screen.getByRole('button', { name: '수정·숨기기' }))
    const manageList = document.querySelector('.reason-manage-list') as HTMLElement
    const health = within(manageList).getByText('건강').closest('div')!
    expect(within(health).getByRole('button', { name: '숨기기' })).toBeInTheDocument()
    expect(within(health).queryByRole('button', { name: '삭제' })).not.toBeInTheDocument()
    expect(within(health).queryByRole('button', { name: '수정' })).not.toBeInTheDocument()
  })

  test('R7 직접 만든 태그 이름이 예전 기록에서 보인다', () => {
    const oldEntry: Entry = { date: TODAY, mood: 'happy', note: '', reason_ids: ['custom-fight'], created_at: timestamp, updated_at: timestamp }
    renderForm({ entry: oldEntry })
    expect(screen.getByRole('button', { name: '친구랑싸움' })).toBeInTheDocument()
  })

  test('R10 이미 있는 잠과 같은 이름은 새로 만들지 않고 기존 잠을 선택한다', async () => {
    const user = userEvent.setup()
    const { onCreateReasonTag } = renderForm()
    await user.click(screen.getByRole('button', { name: /이유 추가/ }))
    await user.click(screen.getByRole('button', { name: '+ 직접 추가' }))
    const input = screen.getByLabelText('직접 추가할 이유')
    await user.type(input, '잠')
    await user.click(within(input.parentElement!).getByRole('button', { name: '추가' }))
    expect(onCreateReasonTag).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '잠' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText('이미 있는 이유예요.')).not.toBeInTheDocument()
  })

  test('R5 직접 만든 태그는 삭제하지 않고 비활성화한다', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { onSetReasonTagActive } = renderForm()
    await user.click(screen.getByRole('button', { name: /이유 추가/ }))
    await user.click(screen.getByRole('button', { name: '수정·숨기기' }))
    const manageList = document.querySelector('.reason-manage-list') as HTMLElement
    const custom = within(manageList).getByText('친구랑싸움').closest('div')!
    expect(within(custom).getByRole('button', { name: '수정' })).toBeInTheDocument()
    await user.click(within(custom).getByRole('button', { name: '숨기기' }))
    expect(confirm).toHaveBeenCalledWith('“친구랑싸움” 이유를 숨길까요? 새 기록의 선택지에서는 사라지지만, 예전 기록과 통계에는 그대로 남아요.')
    expect(onSetReasonTagActive).toHaveBeenCalledWith('custom-fight', false)
    expect(within(custom).queryByRole('button', { name: '삭제' })).not.toBeInTheDocument()
  })
})
