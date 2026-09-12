import { useEffect, useMemo, useState, type ReactElement } from 'react'
import type { SeriesItem, SeriesSeason, SourceConfig } from '../../../shared/types'
import { getSeriesSeasons } from '../lib/xtream'
import { IconPlayCircle, IconSearch } from './Icons'

interface Props {
  series: SeriesItem[]
  source: SourceConfig | null
  playingId?: string
  onPlayEpisode: (title: string, group: string, url: string) => void
}

export function SeriesView({ series, source, playingId, onPlayEpisode }: Props): ReactElement {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<SeriesItem | null>(null)
  const [seasons, setSeasons] = useState<SeriesSeason[]>([])
  const [loading, setLoading] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr')
    if (!q) return series
    return series.filter((s) => s.name.toLocaleLowerCase('tr').includes(q))
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
      <div className="pane pane-items">
        <div className="empty-state empty-state-compact">
          <h3>Henüz dizi yok</h3>
          <p>Diziler yalnızca Xtream Codes kaynaklarında listelenir.</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="pane pane-categories">
        <div className="pane-search">
          <IconSearch size={14} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`${series.length} dizide ara`}
          />
        </div>
        <div className="pane-list category-list">
          {filtered.map((s) => (
            <div
              key={s.id}
              className={`series-row ${selected?.id === s.id ? 'active' : ''}`}
              onClick={() => setSelected(s)}
            >
              {s.logo ? (
                <img src={s.logo} alt="" />
              ) : (
                <div className="series-row-fallback" />
              )}
              <span>{s.name}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="pane pane-items">
        {!selected && (
          <div className="empty-state empty-state-compact">
            <h3>Bir dizi seç</h3>
            <p>Sezon ve bölümleri görmek için soldan bir dizi seç.</p>
          </div>
        )}

        {selected && loading && (
          <div className="empty-state empty-state-compact">
            <div className="spinner" />
            <p>Bölümler yükleniyor…</p>
          </div>
        )}

        {selected && !loading && (
          <div className="pane-list episode-scroll">
            {seasons.map((season) => (
              <div className="season-block" key={season.season}>
                <div className="season-title">Sezon {season.season}</div>
                {season.episodes.map((ep) => (
                  <div
                    className={`episode-row ${playingId === ep.url ? 'active' : ''}`}
                    key={ep.id}
                    onClick={() =>
                      onPlayEpisode(`${selected.name} · ${ep.title}`, selected.group, ep.url)
                    }
                  >
                    <span>
                      {ep.episodeNum}. {ep.title}
                    </span>
                    <IconPlayCircle size={16} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
