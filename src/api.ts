import type { AnalysisResult, Entry, Mood, Stats } from './types'

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options)
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.error || '요청을 처리하지 못했습니다.')
  }
  if (response.status === 204) return undefined as T
  return response.json()
}

export const api = {
  async list(month: string) {
    return (await request<{ entries: Entry[] }>(`/api/entries?month=${month}`)).entries
  },
  async stats(month: string) {
    return (await request<{ stats: Stats }>(`/api/stats?month=${month}`)).stats
  },
  async analysis(days: 7 | 30) {
    return (await request<{ analysis: AnalysisResult }>(`/api/analysis?days=${days}`)).analysis
  },
  async save(date: string, entry: { mood: Mood; note: string }) {
    return (await request<{ entry: Entry }>(`/api/entries/${date}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    })).entry
  },
  async remove(date: string) {
    return request<void>(`/api/entries/${date}`, { method: 'DELETE' })
  },
  async restore(backup: unknown) {
    return request<{ imported: number }>('/api/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(backup),
    })
  },
}
