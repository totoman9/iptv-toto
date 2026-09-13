import { useMemo, type ReactElement } from 'react'
import { usePersisted } from '../lib/persisted'
import { dayKey, resetStats, statsStore, type WatchKind } from '../lib/library'
import { IconLiveTv } from './Icons'

const KIND_LABEL: Record<WatchKind, string> = { live: 'Canlı TV', movie: 'Film', episode: 'Dizi' }
const DAY_NAMES = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt']

function formatDuration(sec: number): string {
  const totalMin = Math.round(sec / 60)
  if (totalMin < 60) return `${totalMin} dk`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return m ? `${h} sa ${m} dk` : `${h} sa`
}

export function StatsView(): ReactElement {
  const stats = usePersisted(statsStore)

  const data = useMemo(() => {
    const today = new Date()
    const days: { key: string; label: string; values: Record<WatchKind, number>; total: number }[] = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i)
      const v = stats.days[dayKey(d)] || {}
      const values = { live: v.live || 0, movie: v.movie || 0, episode: v.episode || 0 }
      days.push({ key: dayKey(d), label: DAY_NAMES[d.getDay()], values, total: values.live + values.movie + values.episode })
    }
    const month = { live: 0, movie: 0, episode: 0 }
    for (let i = 0; i < 30; i++) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i)
      const v = stats.days[dayKey(d)] || {}
      month.live += v.live || 0
      month.movie += v.movie || 0
      month.episode += v.episode || 0
    }
    const items = Object.values(stats.items)
    const top = (kind: WatchKind): typeof items =>
      items.filter((i) => i.kind === kind).sort((a, b) => b.seconds - a.seconds).slice(0, 8)
    const groups = new Map<string, number>()
    for (const i of items) groups.set(i.group, (groups.get(i.group) || 0) + i.seconds)
    const topGroups = [...groups.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
    return {
      days,
      maxDay: Math.max(1, ...days.map((d) => d.total)),
      month,
      monthTotal: month.live + month.movie + month.episode,
      topLive: top('live'),
      topMovie: top('movie'),
      topSeries: top('episode'),
      topGroups
    }
  }, [stats])

  const empty = Object.keys(stats.items).length === 0

  const topList = (title: string, list: typeof data.topLive): ReactElement | null =>
    list.length === 0 ? null : (
      <section className="stats-card">
        <div className="stats-card-title">{title}</div>
        {list.map((i) => (
          <div key={`${i.kind}-${i.name}`} className="stats-top-row">
            <span className="stats-top-logo">
              {i.logo ? (
                <img src={i.logo} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />
              ) : (
                <IconLiveTv size={12} />
              )}
            </span>
            <span className="stats-top-name" title={i.name}>
              {i.name}
            </span>
            <span className="stats-top-bar">
              <span style={{ width: `${(i.seconds / list[0].seconds) * 100}%` }} />
            </span>
            <span className="stats-top-time">{formatDuration(i.seconds)}</span>
          </div>
        ))}
      </section>
    )

  return (
    <div className="library-view">
      <div className="media-toolbar">
        <div className="media-toolbar-title">İzleme istatistiklerim</div>
        <div className="topbar-spacer" />
        {!empty && (
          <button
            className="btn-secondary btn-sm"
            onClick={() => {
              if (confirm('Tüm izleme istatistikleri silinsin mi?')) resetStats()
            }}
          >
            Sıfırla
          </button>
        )}
      </div>
      <div className="library-scroll">
        {empty ? (
          <div className="empty-state">
            <h3>Henüz izleme verisi yok</h3>
            <p>İzledikçe hangi kanalı, filmi ve diziyi ne kadar izlediğin burada görünecek.</p>
          </div>
        ) : (
          <>
            <div className="stats-summary">
              <div className="stats-big">
                <span>Son 30 gün</span>
                <b>{formatDuration(data.monthTotal)}</b>
              </div>
              {(['live', 'movie', 'episode'] as WatchKind[]).map((k) => (
                <div key={k} className={`stats-big stats-kind-${k}`}>
                  <span>{KIND_LABEL[k]}</span>
                  <b>{formatDuration(data.month[k])}</b>
                </div>
              ))}
            </div>

            <section className="stats-card">
              <div className="stats-card-title">Son 14 gün</div>
              <div className="stats-chart">
                {data.days.map((d) => (
                  <div key={d.key} className="stats-day" title={`${d.key}: ${formatDuration(d.total)}`}>
                    <div className="stats-bar" style={{ height: `${(d.total / data.maxDay) * 100}%` }}>
                      {(['episode', 'movie', 'live'] as WatchKind[]).map((k) =>
                        d.values[k] > 0 ? (
                          <span
                            key={k}
                            className={`stats-seg stats-kind-${k}`}
                            style={{ flexGrow: d.values[k] }}
                          />
                        ) : null
                      )}
                    </div>
                    <span className="stats-day-label">{d.label}</span>
                  </div>
                ))}
              </div>
              <div className="stats-legend">
                {(['live', 'movie', 'episode'] as WatchKind[]).map((k) => (
                  <span key={k}>
                    <i className={`stats-kind-${k}`} /> {KIND_LABEL[k]}
                  </span>
                ))}
              </div>
            </section>

            <div className="stats-grid">
              {topList('En çok izlediğin kanallar', data.topLive)}
              {topList('En çok izlediğin diziler', data.topSeries)}
              {topList('Filmler', data.topMovie)}
              {data.topGroups.length > 0 && (
                <section className="stats-card">
                  <div className="stats-card-title">En sevdiğin kategoriler</div>
                  {data.topGroups.map(([g, sec]) => (
                    <div key={g} className="stats-top-row">
                      <span className="stats-top-name" title={g}>
                        {g}
                      </span>
                      <span className="stats-top-bar">
                        <span style={{ width: `${(sec / data.topGroups[0][1]) * 100}%` }} />
                      </span>
                      <span className="stats-top-time">{formatDuration(sec)}</span>
                    </div>
                  ))}
                </section>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
