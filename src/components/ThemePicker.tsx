import { useEffect, useRef, useState } from 'react'
import { THEME_OPTIONS, type ResolvedTheme, type ThemePreference } from '../theme'

type Props = {
  preference: ThemePreference
  resolvedTheme: ResolvedTheme
  saving: boolean
  onChange: (preference: ThemePreference) => void
}

function ThemeIcon({ theme }: { theme: ResolvedTheme }) {
  return theme === 'dark' ? (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 15.2A8.5 8.5 0 0 1 8.8 4a8.5 8.5 0 1 0 11.2 11.2Z" /></svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
  )
}

export function ThemePicker({ preference, resolvedTheme, saving, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  return (
    <div className="theme-picker" ref={wrapperRef}>
      <button
        type="button"
        className="theme-button"
        aria-label="화면 테마 선택"
        aria-haspopup="menu"
        aria-expanded={open}
        title="화면 테마"
        onClick={() => setOpen((current) => !current)}
      >
        <ThemeIcon theme={resolvedTheme} />
      </button>
      {open && (
        <div className="theme-menu" role="menu" aria-label="화면 테마">
          {THEME_OPTIONS.map((option) => (
            <button
              type="button"
              role="menuitemradio"
              aria-checked={preference === option.value}
              className={preference === option.value ? 'active' : ''}
              disabled={saving}
              key={option.value}
              onClick={() => { onChange(option.value); setOpen(false) }}
            >
              <span>{option.label}</span><i aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
