import { useEffect, useMemo, useState, type ReactElement } from 'react'
import type { SeriesItem, SeriesSeason, SourceConfig } from '../../../shared/types'
import { getSeriesSeasons } from '../lib/xtream'

interface Props {
  series: SeriesItem[]
  search: string
  source: SourceConfig | null
  onPlayEpisode: (title: string, group: string, url: string) => void
}

export function SeriesView({ series, search, source, onPlayEpisode }: Props): ReactElement {
  const [selected, setSelected] = useState<SeriesItem | null>(null)
  const [seasons, setSeasons] = useState<SeriesSeason[]>([])
  const [loading, setLoading] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return series
    return series.filter((s) => s.name.toLowerCase().includes(q))
  }, [series, search])

  useEffect(() => {
    if (!selected || !source || source.type !== 'xtream') {
      setSeasons([])
      return
    }
    let cancelled = false
    setLoading(true)
    getSeriesSeasons(source, selected.seriesId).then((data) => {
      if (!cancelled) {
        setSeasons(data)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [selected, source])

  if (series.length === 0) {
    return (
      <div className="empty-state">
        <h3>Henüz dizi yok</h3>
        <p>Diziler yalnızca Xtream Codes kaynaklarında listelenir.</p>
      </div>
    )
  }

  return (
    <div className="series-layout">
      <div className="series-list">
        {filtered.map((s) => (
          <div
            key={s.id}
            className={`series-list-item ${selected?.id === s.id ? 'active' : ''}`}
            onClick={() => setSelected(s)}
          >
            {s.logo ? (
              <img src={s.logo} alt="" />
            ) : (
              <div
                style={{
                  width: 40,
                  height: 56,
                  borderRadius: 6,
                  background: 'var(--bg-elevated)'
                }}
              />
            )}
            <div style={{ fontSize: 12.5, fontWeight: 600 }}>{s.name}</div>
          </div>
        ))}
      </div>

      <div style={{ overflowY: 'auto' }}>
        {!selected && (
          <div className="empty-state">
            <h3>Bir dizi seç</h3>
            <p>Sezon ve bölümleri görmek için soldan bir dizi seç.</p>
          </div>
        )}

        {selected && loading && (
          <div className="empty-state">
            <div className="spinner" />
            <p>Bölümler yükleniyor…</p>
          </div>
        )}

        {selected &&
          !loading &&
          seasons.map((season) => (
            <div className="season-block" key={season.season}>
              <div className="season-title">Sezon {season.season}</div>
              {season.episodes.map((ep) => (
                <div
                  className="episode-row"
                  key={ep.id}
                  onClick={() => onPlayEpisode(`${selected.name} · ${ep.title}`, selected.group, ep.url)}
                >
                  <span>
                    {ep.episodeNum}. {ep.title}
                  </span>
                  <span>▶</span>
                </div>
              ))}
            </div>
          ))}
      </div>
    </div>
  )
}
