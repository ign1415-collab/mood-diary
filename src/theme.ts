export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_OPTIONS: Array<{ value: ThemePreference; label: string }> = [
  { value: 'system', label: '기기 설정 따르기' },
  { value: 'light', label: '항상 라이트' },
  { value: 'dark', label: '항상 다크' },
]

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark'
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): ResolvedTheme {
  return preference === 'system' ? (systemDark ? 'dark' : 'light') : preference
}

export function watchTheme(preference: ThemePreference, onChange?: (theme: ResolvedTheme) => void) {
  const media = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null
  const apply = () => {
    const resolved = resolveTheme(preference, media?.matches ?? false)
    document.documentElement.dataset.theme = resolved
    // `only` prevents mobile browsers from applying their own forced-dark
    // conversion on top of the app theme (which can wash out SVG faces).
    document.documentElement.style.colorScheme = `only ${resolved}`
    document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]')?.setAttribute('content', resolved)
    onChange?.(resolved)
  }
  apply()
  if (preference === 'system') media?.addEventListener?.('change', apply)
  return () => {
    if (preference === 'system') media?.removeEventListener?.('change', apply)
  }
}

export function restoreSystemTheme() {
  const systemDark = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches
  const resolved = resolveTheme('system', systemDark)
  document.documentElement.dataset.theme = resolved
  document.documentElement.style.colorScheme = `only ${resolved}`
  document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]')?.setAttribute('content', 'light dark')
}
