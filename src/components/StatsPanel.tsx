import type { Mood, Stats } from '../types'
import { MOODS } from '../types'

interface Props {
  stats: Stats | null
  loading: boolean
}

export function StatsPanel({ stats, loading }: Props) {
  const dominantMood = stats && stats.total > 0
    ? (Object.keys(MOODS) as Mood[]).reduce((best, mood) => stats.moods[mood].count > stats.moods[best].count ? mood : best)
    : null

  return (
    <section className="stats-card" aria-labelledby="stats-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">월간 돌아보기</p>
          <h2 id="stats-title">마음의 분포</h2>
        </div>
      </div>
      {loading ? (
        <p className="empty-copy">통계를 불러오고 있어요.</p>
      ) : !stats || stats.total === 0 ? (
        <div className="empty-state">
          <span aria-hidden="true">○</span>
          <p>이 달의 첫 마음을 기록해 보세요.</p>
        </div>
      ) : (
        <>
          <div className="stats-summary">
            <div><strong>{stats.total}</strong><span>기록한 날</span></div>
            <div><strong className="dominant-mood">{dominantMood ? MOODS[dominantMood].label : '-'}</strong><span>가장 잦은 감정</span></div>
          </div>
          <div className="mood-bars">
            {(Object.keys(MOODS) as Mood[]).map((mood) => {
              const value = stats.moods[mood]
              return (
                <div className="bar-row" key={mood}>
                  <div className="bar-label"><span className={`legend-dot mood-${mood}`} />{MOODS[mood].label}</div>
                  <div className="bar-track" aria-label={`${MOODS[mood].label} ${value.count}일, ${value.percentage}%`}>
                    <span className={`mood-${mood}`} style={{ width: `${value.percentage}%` }} />
                  </div>
                  <strong>{value.count}<small>일</small></strong>
                </div>
              )
            })}
          </div>
        </>
      )}
    </section>
  )
}
