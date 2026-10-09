export type Mood = 'happy' | 'excited' | 'calm' | 'neutral' | 'depressed' | 'anxious' | 'tired' | 'angry'

export interface WeatherSnapshot {
  icon: string
  description: string
  temperature?: number
  location?: string
  observed_at?: string
}

export interface Entry {
  date: string
  mood: Mood
  note: string
  reason_ids?: string[]
  weather?: WeatherSnapshot
  created_at: string
  updated_at: string
}

export interface ReasonTag {
  id: string
  label: string
  active: boolean
  built_in: boolean
  created_at: string
  updated_at: string
}

export const DEFAULT_REASON_TAGS = [
  { id: 'person', label: '사람' },
  { id: 'sleep', label: '잠' },
  { id: 'health', label: '건강' },
  { id: 'study', label: '공부' },
  { id: 'work', label: '일' },
] as const

export interface MoodStat {
  count: number
  percentage: number
}

export interface Stats {
  total: number
  moods: Record<Mood, MoodStat>
}

export interface AnalysisResult extends Stats {
  days: 7 | 30
  entries: Entry[]
  streak_entries?: Entry[]
  comparison?: {
    current: Entry[]
    previous: Entry[]
  }
  comparison_pool?: Entry[]
}

export interface Backup {
  schemaVersion: 3
  exportedAt: string
  entries: Entry[]
  reason_tags: ReasonTag[]
}

export const MOODS: Record<Mood, { label: string; phrase: string; color: string; soft: string; text: string; selectedText: string }> = {
  happy: { label: '행복', phrase: '행복한 날', color: '#FFC857', soft: '#FFF4D6', text: '#6B4A00', selectedText: '#6B4A00' },
  calm: { label: '평온', phrase: '평온한 날', color: '#7FD1AE', soft: '#E3F6EE', text: '#0F5A3E', selectedText: '#0F5A3E' },
  excited: { label: '설렘', phrase: '설레는 날', color: '#F58FB0', soft: '#FDE7EF', text: '#8A1F4E', selectedText: '#8A1F4E' },
  neutral: { label: '보통', phrase: '보통인 날', color: '#DDD0BC', soft: '#F6F1E9', text: '#5A4A33', selectedText: '#5A4A33' },
  depressed: { label: '우울', phrase: '우울한 날', color: '#7FAAF0', soft: '#E6EFFD', text: '#12326B', selectedText: '#12326B' },
  anxious: { label: '불안', phrase: '불안한 날', color: '#6E7896', soft: '#E9EBF2', text: '#FFFFFF', selectedText: '#46506D' },
  tired: { label: '피곤', phrase: '피곤한 날', color: '#A594CC', soft: '#EFEBF8', text: '#3F3270', selectedText: '#3F3270' },
  angry: { label: '화남', phrase: '화난 날', color: '#B3364A', soft: '#F9E4E8', text: '#FFFFFF', selectedText: '#861F32' },
}
