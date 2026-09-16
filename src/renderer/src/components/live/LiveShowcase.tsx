import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import type { Channel } from '../../../../shared/types'
import type { ChannelMeta } from '../ItemListColumn'
import { ChannelHoverCard, type ChannelHoverTarget } from './ChannelHoverCard'
import {
  IconChevronRight,
  IconEdit,
  IconGrid,
  IconGuide,
  IconLiveTv,
  IconLock,
  IconPlay,
  IconSearch,
  IconStar
} from '../Icons'

const ROW_LIMIT = 28
const HOVER_DELAY_MS = 350

function RowScroller({ children }: { children: ReactElement[] }): ReactElement {
  const ref = useRef<HTMLDivElement>(null)
  const scroll = (dir: 1 | -1): void => {
    const el = ref.current
    if (el) el.scrollBy({ left: dir * (el.clientWidth - 120), behavior: 'smooth' })
  }
  return (
    <div className="media-row-scroller-wrap">
      <button className="row-arrow row-arrow-left" onClick={() => scroll(-1)} aria-label="Sola kaydır">
        <IconChevronRight size={18} style={{ transform: 'rotate(180deg)' }} />
      </button>
      <div className="media-row-scroller lv-row-scroller" ref={ref}>
        {children}
      </div>
      <button className="row-arrow row-arrow-right" onClick={() => scroll(1)} aria-label="Sağa kaydır">
        <IconChevronRight size={18} />
      </button>
    </div>
  )
}

function ChannelTile({
  channel,
  active,
  locked,
  meta,
  onClick,
  onHoverStart,
  onHoverEnd
}: {
  channel: Channel
  active: boolean
  locked: boolean
  meta?: ChannelMeta
  onClick: () => void
  onHoverStart: (el: HTMLElement) => void
  onHoverEnd: () => void
}): ReactElement {
  const [broken, setBroken] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  return (
    <button
      className={`lv-tile ${active ? 'active' : ''}`}
      onClick={onClick}
      title={channel.name}
      onMouseEnter={(e) => {
        const el = e.currentTarget
        timer.current = setTimeout(() => onHoverStart(el), HOVER_DELAY_MS)
      }}
      onMouseLeave={() => {
        if (timer.current) clearTimeout(timer.current)
        timer.current = null
        onHoverEnd()
      }}
    >
      <div className="lv-tile-logo">
        {channel.logo && !broken ? (
          <img src={channel.logo} alt="" loading="lazy" onError={() => setBroken(true)} />
        ) : (
          <span>{channel.name.slice(0, 2).toUpperCase()}</span>
        )}
        {meta?.now && <span className="lv-tile-live" />}
        {locked && (
          <div className="poster-locked">
            <IconLock size={16} />
          </div>
        )}
      </div>
      <span className="lv-tile-name">{channel.name}</span>
    </button>
  )
}

export function LiveShowcase({
  channels,
  categoryOrder,
  lockedGroups,
  isLocked,
  guard,
  favoriteIds,
  onToggleFavorite,
  onSelect,
  selectedId,
  getMeta,
  onOpenGuide,
  onOpenMultiView,
  onEditCategories,
  onSwitchClassic
}: {
  channels: Channel[]
  categoryOrder: string[]
  lockedGroups: string[]
  isLocked: (group: string) => boolean
  guard: (group: string, action: () => void) => void
  favoriteIds: Set<string>
  onToggleFavorite: (id: string) => void
  onSelect: (channel: Channel) => void
  selectedId?: string
  getMeta: (channel: Channel) => ChannelMeta | undefined
  onOpenGuide?: () => void
  onOpenMultiView?: () => void
  onEditCategories?: () => void
  onSwitchClassic: () => void
}): ReactElement {
  const [search, setSearch] = useState('')
  const [hover, setHover] = useState<ChannelHoverTarget | null>(null)
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const scrollRef = useRef<HTMLDivElement>(null)

  const byGroup = useMemo(() => {
    const map = new Map<string, Channel[]>()
    for (const c of channels) {
      const list = map.get(c.group)
      if (list) list.push(c)
      else map.set(c.group, [c])
    }
    return map
  }, [channels])

  const orderedGroups = useMemo(() => {
    const known = categoryOrder.filter((g) => byGroup.has(g))
    const extra = Array.from(byGroup.keys()).filter((g) => !categoryOrder.includes(g))
    return [...known, ...extra]
  }, [categoryOrder, byGroup])

  const searchResults = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr')
    if (!q) return null
    return channels.filter((c) => c.name.toLocaleLowerCase('tr').includes(q)).slice(0, 400)
  }, [search, channels])

  // Vitrin: favorin varsa ilk favorin, yoksa ilk kilitli olmayan kanal
  const heroChannel = useMemo(() => {
    const fav = channels.find((c) => favoriteIds.has(c.id) && !isLocked(c.group))
    return fav || channels.find((c) => !isLocked(c.group)) || channels[0]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels, favoriteIds, lockedGroups])
  const heroMeta = heroChannel ? getMeta(heroChannel) : undefined

  // Netflix'teki gibi: fare kartın VE büyümüş önizlemenin dışına gerçekten
  // çıkana kadar kapanmasın (bkz. MediaBrowser'daki aynı yaklaşım).
  useEffect(() => {
    if (!hover) return
    let closeTimer: ReturnType<typeof setTimeout> | null = null
    const inRect = (r: DOMRect, x: number, y: number, pad: number): boolean =>
      x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad
    const scheduleClose = (): void => {
      if (closeTimer) return
      closeTimer = setTimeout(() => setHover(null), 220)
    }
    const cancelScheduledClose = (): void => {
      if (closeTimer) {
        clearTimeout(closeTimer)
        closeTimer = null
      }
    }
    const onMove = (e: MouseEvent): void => {
      const overTile = inRect(hover.rect, e.clientX, e.clientY, 8)
      const previewEl = document.querySelector('.lv-hover')
      const overPreview = previewEl ? inRect(previewEl.getBoundingClientRect(), e.clientX, e.clientY, 8) : false
      if (overTile || overPreview) cancelScheduledClose()
      else scheduleClose()
    }
    const onDocLeave = (): void => setHover(null)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseleave', onDocLeave)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseleave', onDocLeave)
      cancelScheduledClose()
    }
  }, [hover])

  useEffect(() => {
    const onWheel = (e: WheelEvent): void => {
      const target = e.target as HTMLElement | null
      if (target?.closest('.lv-hover')) {
        // Önizleme kartı sayfanın dışında bir portalda olduğu için tekerlek
        // olayı asıl listeye ulaşmıyordu — elle aktarıyoruz, kutu kaydırma
        // sırasında (Mac'te iki parmakla dahil) açık kalıyor.
        if (scrollRef.current) {
          e.preventDefault()
          scrollRef.current.scrollBy({ top: e.deltaY })
        }
        // Önizleme, bağlı olduğu asıl kutucukla birlikte kaysın; kutucuk
        // ekran dışına çıkınca önizleme de kapansın — yoksa liste kayarken
        // kutu ekranda sabit kalıp sonsuza kadar takip ediyormuş gibi
        // görünüyordu.
        setHover((h) => {
          if (!h?.el) return h
          const r = h.el.getBoundingClientRect()
          if (!r.width || !r.height || r.bottom < 0 || r.top > window.innerHeight) return null
          return { ...h, rect: r }
        })
        return
      }
      setHover(null)
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      window.removeEventListener('wheel', onWheel)
    }
  }, [])

  function play(channel: Channel): void {
    setHover(null)
    guard(channel.group, () => onSelect(channel))
  }

  function scrollToGroup(g: string): void {
    rowRefs.current[g]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="media-browser lv-browser is-home">
      <div className="media-toolbar">
        <div className="media-toolbar-title">Canlı TV</div>
        <div className="topbar-spacer" />
        <div className="pane-search media-search">
          <IconSearch size={14} />
          <input
            value={search}
            onChange={(ev) => setSearch(ev.target.value)}
            placeholder={`${channels.length.toLocaleString('tr-TR')} kanal içinde ara`}
          />
        </div>
        {onEditCategories && (
          <button className="icon-btn" onClick={onEditCategories} title="Kategorileri düzenle (gizle / sabitle)">
            <IconEdit size={14} />
          </button>
        )}
        {onOpenGuide && (
          <button className="icon-btn" onClick={onOpenGuide} title="TV rehberi: kanalların program akışı">
            <IconGuide size={15} />
          </button>
        )}
        {onOpenMultiView && (
          <button className="icon-btn" onClick={onOpenMultiView} title="Çoklu ekran: 2–4 kanalı aynı anda izle">
            <IconGrid size={15} />
          </button>
        )}
        <div className="seg-toggle">
          <button className="active" title="Vitrin görünümü">
            <IconLiveTv size={13} /> Vitrin
          </button>
          <button onClick={onSwitchClassic} title="Klasik liste görünümü">
            <IconGrid size={13} /> Klasik
          </button>
        </div>
      </div>

      {searchResults ? (
        <div className="media-scroll" ref={scrollRef} style={{ overflowY: 'auto', padding: '14px 22px' }}>
          <div className="media-page-sub" style={{ padding: 0, marginBottom: 10 }}>
            “{search.trim()}” için {searchResults.length} sonuç
          </div>
          <div className="lv-search-grid">
            {searchResults.map((c) => (
              <ChannelTile
                key={c.id}
                channel={c}
                active={selectedId === c.id}
                locked={isLocked(c.group)}
                meta={getMeta(c)}
                onClick={() => play(c)}
                onHoverStart={(el) => setHover({ channel: c, rect: el.getBoundingClientRect(), meta: getMeta(c), el })}
                onHoverEnd={() => {}}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="media-scroll" ref={scrollRef} style={{ overflowY: 'auto' }}>
          {heroChannel && (
            <div className="lv-hero">
              <div className="lv-hero-glow" />
              <div className="lv-hero-content">
                <div className="lv-hero-logo">
                  {heroChannel.logo ? <img src={heroChannel.logo} alt="" /> : <IconLiveTv size={30} />}
                </div>
                <div>
                  <div className="lv-hero-kicker">
                    {favoriteIds.has(heroChannel.id) ? 'Favorin' : 'Öne çıkan kanal'}
                  </div>
                  <div className="lv-hero-title">{heroChannel.name}</div>
                  {heroMeta?.now ? (
                    <div className="lv-hero-now">
                      <span className="epg-chip">ŞİMDİ</span> {heroMeta.now}
                    </div>
                  ) : (
                    <div className="lv-hero-now lv-hero-now-muted">{heroChannel.group}</div>
                  )}
                  <div className="media-hero-actions" style={{ marginTop: 14 }}>
                    <button className="btn-light" onClick={() => play(heroChannel)}>
                      <IconPlay size={14} /> İzle
                    </button>
                    <button className="btn-glass" onClick={() => onToggleFavorite(heroChannel.id)}>
                      <IconStar size={14} filled={favoriteIds.has(heroChannel.id)} />
                      {favoriteIds.has(heroChannel.id) ? ' Favoride' : ' Favorilere ekle'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="lv-chip-row">
            {orderedGroups.map((g) => (
              <button key={g} className="chip-btn" onClick={() => scrollToGroup(g)}>
                {g}
                {lockedGroups.includes(g) && <IconLock size={10} />}
              </button>
            ))}
          </div>

          {orderedGroups.map((g) => {
            const list = (byGroup.get(g) || []).slice(0, ROW_LIMIT)
            if (list.length === 0) return null
            return (
              <div
                className="media-row"
                key={g}
                ref={(el) => {
                  rowRefs.current[g] = el
                }}
              >
                <div className="media-row-head">
                  <span className="media-row-title">{g}</span>
                  <span className="media-row-count">{byGroup.get(g)?.length}</span>
                </div>
                <RowScroller>
                  {list.map((c) => (
                    <ChannelTile
                      key={c.id}
                      channel={c}
                      active={selectedId === c.id}
                      locked={isLocked(c.group)}
                      meta={getMeta(c)}
                      onClick={() => play(c)}
                      onHoverStart={(el) =>
                        setHover({ channel: c, rect: el.getBoundingClientRect(), meta: getMeta(c), el })
                      }
                      onHoverEnd={() => {}}
                    />
                  ))}
                </RowScroller>
              </div>
            )
          })}
          <div style={{ height: 24 }} />
        </div>
      )}

      {hover && (
        <ChannelHoverCard
          target={hover}
          isFavorite={favoriteIds.has(hover.channel.id)}
          isLocked={isLocked(hover.channel.group)}
          onPlay={() => play(hover.channel)}
          onToggleFavorite={() => onToggleFavorite(hover.channel.id)}
        />
      )}
    </div>
  )
}
