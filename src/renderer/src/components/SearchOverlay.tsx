import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import type { Channel, EpgProgram, SeriesItem, VodItem } from '../../../shared/types'
import type { IndexedChannel } from '../lib/epgIndex'
import { fold } from '../lib/search'
import { IconBell, IconGuide, IconLiveTv, IconMovie, IconSearch, IconSeries } from './Icons'

export type SearchKind = 'live' | 'vod' | 'series'

export interface ProgramHit {
  key: string
  channel: IndexedChannel
  program: EpgProgram
  folded: string
}

interface Props {
  channels: Channel[]
  vod: VodItem[]
  series: SeriesItem[]
  isLocked: (group: string) => boolean
  onPick: (kind: SearchKind, id: string) => void
  onClose: () => void
  // Rehberden toplanan yaklaşan programlar
  programs?: ProgramHit[]
  isReminded?: (channelId: string, start: number) => boolean
  onToggleReminder?: (channel: IndexedChannel, program: EpgProgram) => void
}

const pad2 = (n: number): string => String(n).padStart(2, '0')
function programTime(p: EpgProgram, now: number): string {
  if (p.start <= now) return 'CANLI'
  const d = new Date(p.start)
  const sameDay = new Date().toDateString() === d.toDateString()
  return `${sameDay ? '' : `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)} `}${pad2(d.getHours())}:${pad2(d.getMinutes())}`
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
export function SearchOverlay({
  channels,
  vod,
  series,
  isLocked,
  onPick,
  onClose,
  programs = [],
  isReminded,
  onToggleReminder
}: Props): ReactElement {
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
    const now = Date.now()
    const progs: ProgramHit[] = []
    for (const h of programs) {
      if (h.program.end > now && h.folded.includes(q)) {
        progs.push(h)
        if (progs.length >= 10) break
      }
    }
    progs.sort((a, b) => a.program.start - b.program.start)
    return {
      live: pick(index.live, q, 12, isLocked),
      programs: progs,
      vod: pick(index.vod, q, 18, isLocked),
      series: pick(index.series, q, 18, isLocked)
    }
  }, [query, index, isLocked, programs])

  const total = results
    ? results.live.length + results.programs.length + results.vod.length + results.series.length
    : 0
  const nowMs = Date.now()

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

            {results.programs.length > 0 && (
              <section>
                <div className="search-section-title">
                  <IconGuide size={14} /> Programlar
                </div>
                {results.programs.map(({ key, channel, program }) => {
                  const live = program.start <= nowMs
                  const reminded = isReminded?.(channel.channelId, program.start)
                  return (
                    <div
                      key={key}
                      className="search-program"
                      onClick={() => onPick('live', channel.channelId)}
                      title={live ? 'Kanalı aç' : 'Kanalı aç (program henüz başlamadı)'}
                    >
                      <span className="search-program-time">{programTime(program, nowMs)}</span>
                      <span className="search-program-main">
                        <span className="search-program-title">{program.title}</span>
                        <span className="search-program-channel">{channel.name}</span>
                      </span>
                      {!live && onToggleReminder && (
                        <button
                          className={`btn-secondary btn-sm ${reminded ? 'is-reminded' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            onToggleReminder(channel, program)
                          }}
                        >
                          <IconBell size={12} /> {reminded ? 'Hatırlatılacak' : 'Hatırlat'}
                        </button>
                      )}
                    </div>
                  )
                })}
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
