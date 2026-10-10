import { describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Calendar } from '../src/components/Calendar'
import type { Entry } from '../src/types'

describe('홈 달력 기존 데이터 호환', () => {
  test('H5 알 수 없는 감정값을 회색 칸으로 표시하고 화면이 멈추지 않는다', () => {
    const unknownEntry = {
      date: '2026-10-05',
      mood: 'unknown',
      note: '예전 데이터',
      created_at: '2026-10-05T00:00:00.000Z',
      updated_at: '2026-10-05T00:00:00.000Z',
    } as unknown as Entry

    expect(() => render(
      <Calendar
        month="2026-10"
        entries={[unknownEntry]}
        selectedDate="2026-10-05"
        today="2026-10-09"
        onMonthChange={vi.fn()}
        onSelect={vi.fn()}
      />,
    )).not.toThrow()

    const day = screen.getByRole('button', { name: '10월 5일, 알 수 없는 감정' })
    expect(day).toHaveClass('unknown-mood')
    expect(day).toHaveAttribute('aria-pressed', 'true')
  })
})
