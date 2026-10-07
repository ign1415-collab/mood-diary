export type Mood = 'happy' | 'neutral' | 'depressed' | 'angry'

export interface WeatherSnapshot {
  icon: string
  temperature: number
  description: string
  location: string
  observed_at: string
}

export interface Entry {
  date: string
  mood: Mood
  note: string
  weather?: WeatherSnapshot
  created_at: string
  updated_at: string
}

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
}

export interface Backup {
  schemaVersion: 2
  exportedAt: string
  entries: Entry[]
}

export const MOODS: Record<Mood, { label: string; emoji: string; color: string }> = {
  happy: { label: '행복', emoji: '●', color: '#f2a33a' },
  neutral: { label: '평범', emoji: '●', color: '#3aa981' },
  depressed: { label: '우울', emoji: '●', color: '#5579d8' },
  angry: { label: '화남', emoji: '●', color: '#df5b57' },
}
