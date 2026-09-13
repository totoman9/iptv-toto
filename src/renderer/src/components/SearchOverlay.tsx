import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import type { Channel, SeriesItem, VodItem } from '../../../shared/types'
import { fold } from '../lib/search'
import { IconLiveTv, IconMovie, IconSearch, IconSeries } from './Icons'

export type SearchKind = 'live' | 'vod' | 'series'

interface Props {
  channels: Channel[]
  vod: VodItem[]
  series: SeriesItem[]
  isLocked: (group: string) => boolean
  onPick: (kind: SearchKind, id: string) => void
  onClose: () => void
}

type Indexed<T> = readonly (readonly [string, T])[]

function pick<T extends { group: string }>(
  list: Indexed<T>,
  query: string,
  limit: number,
  isLocked: (g: string) => boolean
): T[] {
  const out: T[] = []
  for (const [name, item] of list) {
    if (name.includes(query) && !isLocked(item.group)) {
      out.push(item)
      if (out.length >= limit) break
    }
  }
  return out
}

// Her yerde arama (⌘K): kanal, film ve dizileri tek kutudan arar.
export function SearchOverlay({ channels, vod, series, isLocked, onPick, onClose }: Props): ReactElement {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Adlar bir kere sadeleştirilir; her tuşta onbinlerce adı yeniden işlememek için
  const index = useMemo(
    () => ({
      live: channels.map((c) => [fold(c.name), c] as const),
      vod: vod.map((v) => [fold(v.name), v] as const),
      series: series.map((s) => [fold(s.name), s] as const)
    }),
    [channels, vod, series]
  )

  const results = useMemo(() => {
    const q = fold(query.trim())
    if (q.length < 2) return null
    return {
      live: pick(index.live, q, 12, isLocked),
      vod: pick(index.vod, q, 18, isLocked),
      series: pick(index.series, q, 18, isLocked)
    }
  }, [query, index, isLocked])

  const total = results ? results.live.length + results.vod.length + results.series.length : 0

  function pickFirst(): void {
    if (!results) return
    if (results.live[0]) onPick('live', results.live[0].id)
    else if (results.vod[0]) onPick('vod', results.vod[0].id)
    else if (results.series[0]) onPick('series', results.series[0].id)
  }

  return (
    <div className="search-overlay" onMouseDown={onClose}>
      <div className="search-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="search-input-row">
          <IconSearch size={17} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Kanal, film veya dizi ara…"
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose()
              if (e.key === 'Enter') pickFirst()
            }}
          />
          <kbd>Esc</kbd>
        </div>

        {!results ? (
          <p className="search-hint">En az 2 harf yaz. Enter ilk sonucu açar.</p>
        ) : total === 0 ? (
          <p className="search-hint">“{query.trim()}” için sonuç bulunamadı.</p>
        ) : (
          <div className="search-results">
            {results.live.length > 0 && (
              <section>
                <div className="search-section-title">
                  <IconLiveTv size={14} /> Kanallar
                </div>
                <div className="search-channel-list">
                  {results.live.map((c) => (
                    <button key={c.id} className="search-channel" onClick={() => onPick('live', c.id)}>
                      <span className="search-channel-logo">
                        {c.logo ? (
                          <img src={c.logo} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />
                        ) : (
                          c.name.slice(0, 2).toUpperCase()
                        )}
                      </span>
                      <span className="search-channel-name">{c.name}</span>
                      <span className="search-channel-group">{c.group}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {(
              [
                ['vod', 'Filmler', IconMovie, results.vod],
                ['series', 'Diziler', IconSeries, results.series]
              ] as const
            ).map(([kind, label, Icon, list]) =>
              list.length > 0 ? (
                <section key={kind}>
                  <div className="search-section-title">
                    <Icon size={14} /> {label}
                  </div>
                  <div className="search-poster-grid">
                    {list.map((item) => (
                      <button key={item.id} className="search-poster" onClick={() => onPick(kind, item.id)}>
                        <span className="search-poster-img">
                          {item.logo ? (
                            <img src={item.logo} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />
                          ) : (
                            item.name.slice(0, 2)
                          )}
                        </span>
                        <span className="search-poster-name">{item.name}</span>
                      </button>
                    ))}
                  </div>
                </section>
              ) : null
            )}
          </div>
        )}
      </div>
    </div>
  )
}
