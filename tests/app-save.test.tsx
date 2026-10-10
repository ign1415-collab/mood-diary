import { beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Entry } from '../src/types'

let apiMock: Record<string, ReturnType<typeof vi.fn>>

vi.mock('../src/api', () => ({ createDiaryApi: () => apiMock }))
vi.mock('../src/components/WeatherBadge', () => ({ WeatherBadge: () => null }))

import App from '../src/App'

const timestamp = '2026-10-09T00:00:00.000Z'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  window.localStorage.clear()
  apiMock = {
    list: vi.fn(async () => []),
    listReasonTags: vi.fn(async () => []),
    analysis: vi.fn(async () => ({ days: 7, total: 0, moods: {}, entries: [] })),
    hasAnyEntries: vi.fn(async () => false),
    save: vi.fn(),
    remove: vi.fn(),
    setReasonTagActive: vi.fn(),
    createReasonTag: vi.fn(),
    renameReasonTag: vi.fn(),
    getThemePreference: vi.fn(async () => 'system'),
    setThemePreference: vi.fn(async () => undefined),
  }
})

describe('계정 테마 선택', () => {
  test('저장된 다크 테마를 불러오고 라이트 선택을 계정에 저장한다', async () => {
    apiMock.getThemePreference.mockResolvedValue('dark')
    const user = userEvent.setup()
    render(<App userId="qa-user" userEmail="qa@example.com" onSignOut={vi.fn()} todayOverride="2026-10-09" />)

    await waitFor(() => expect(document.documentElement).toHaveAttribute('data-theme', 'dark'))
    await user.click(screen.getByRole('button', { name: '화면 테마 선택' }))
    expect(screen.getByRole('menuitemradio', { name: '항상 다크' })).toHaveAttribute('aria-checked', 'true')

    await user.click(screen.getByRole('menuitemradio', { name: '항상 라이트' }))
    await waitFor(() => expect(apiMock.setThemePreference).toHaveBeenCalledWith('light'))
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
  })
})

describe('느린 모바일 네트워크 저장', () => {
  test('PERF1 저장 응답 전에는 중복 클릭을 막고 응답 직후 월 전체 재조회 없이 버튼을 푼다', async () => {
    const pending = deferred<Entry>()
    apiMock.save.mockReturnValue(pending.promise)
    const user = userEvent.setup()

    render(<App userId="qa-user" userEmail="qa@example.com" onSignOut={vi.fn()} todayOverride="2026-10-09" />)
    await waitFor(() => expect(apiMock.list).toHaveBeenCalledOnce())
    expect(screen.queryByText(/이어서 기록|끊겼어요/)).not.toBeInTheDocument()

    await user.click(screen.getByLabelText('행복'))
    await user.type(screen.getByLabelText('마음 기록'), '느린 네트워크 테스트')
    await user.click(screen.getByRole('button', { name: '저장하기' }))

    const savingButton = screen.getByRole('button', { name: '저장 중…' })
    expect(savingButton).toBeDisabled()
    expect(apiMock.save).toHaveBeenCalledOnce()
    expect(apiMock.list).toHaveBeenCalledOnce()

    pending.resolve({
      date: '2026-10-09',
      mood: 'happy',
      note: '느린 네트워크 테스트',
      created_at: timestamp,
      updated_at: timestamp,
    })

    await waitFor(() => expect(screen.queryByRole('button', { name: '저장 중…' })).not.toBeInTheDocument())
    expect(apiMock.list).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: '수정 내용 저장' })).toBeEnabled()
  })
})
