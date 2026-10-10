import { describe, expect, test } from 'vitest'
import { isThemePreference, resolveTheme } from '../src/theme'

describe('테마 선택 규칙', () => {
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
})
