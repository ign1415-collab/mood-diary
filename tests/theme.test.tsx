import { afterEach, describe, expect, test, vi } from 'vitest'
import { isThemePreference, resolveTheme, watchTheme } from '../src/theme'

describe('테마 선택 규칙', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.style.removeProperty('color-scheme')
  })

  test('기기 설정은 시스템 테마를 따르고 명시 선택은 그대로 적용한다', () => {
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  test('저장 가능한 테마 값 세 가지만 허용한다', () => {
    expect(['system', 'light', 'dark'].every(isThemePreference)).toBe(true)
    expect(isThemePreference('auto')).toBe(false)
  })

  test('명시한 다크 모드는 모바일 브라우저의 강제 색 변환을 막는다', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })))

    const stop = watchTheme('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.documentElement.style.colorScheme).toBe('only dark')
    stop()
    vi.unstubAllGlobals()
  })
})
