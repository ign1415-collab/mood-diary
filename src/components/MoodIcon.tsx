import type { Mood } from '../types'

type MoodIconProps = {
  mood: Mood
  size?: number
  className?: string
}

const facePaths: Record<Mood, string> = {
  happy: 'M9 9.5v.6M15 9.5v.6M8 14c1.2 1.8 2.6 2.5 4 2.5s2.8-.7 4-2.5',
  excited: 'M8 10.2c.6-.9 1.4-.9 2 0M14 10.2c.6-.9 1.4-.9 2 0M8 14c1.2 1.8 2.6 2.5 4 2.5s2.8-.7 4-2.5',
  calm: 'M8 9.8c.6.9 1.4.9 2 0M14 9.8c.6.9 1.4.9 2 0M9 14.5c1 1 2 1.4 3 1.4s2-.4 3-1.4',
  neutral: 'M9 9.5v.6M15 9.5v.6M8.5 15h7',
  depressed: 'M9 9.5v.6M15 9.5v.6M8 16.5c1.2-1.6 2.6-2.2 4-2.2s2.8.6 4 2.2',
  anxious: 'M9 9.5v.6M15 9.5v.6M8 15.6l2-1.2 2 1.2 2-1.2 2 1.2',
  tired: 'M8 10h2.2M13.8 10h2.2M9.5 15.5h5',
  angry: 'M7.5 8l3 1.3M16.5 8l-3 1.3M9 11v.4M15 11v.4M8 16.5c1.2-1.6 2.6-2.2 4-2.2s2.8.6 4 2.2',
}

export function MoodIcon({ mood, size = 28, className = '' }: MoodIconProps) {
  return (
    <svg
      className={`mood-icon mood-${mood} ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="11" fill="var(--mood-color)" />
      <path
        d={facePaths[mood]}
        fill="none"
        stroke="var(--mood-face)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
