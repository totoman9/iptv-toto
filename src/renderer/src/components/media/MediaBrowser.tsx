import { useMemo, useRef, useState, type ReactElement } from 'react'
import { List, type RowComponentProps } from 'react-window'
import type {
  PlayableItem,
  SeriesEpisode,
  SeriesItem,
  SourceConfig,
  VodItem
} from '../../../../shared/types'
import type { SectionStatus } from '../../hooks/useLibrary'
import type { ContinueWatchingEntry } from '../../lib/storage'
import { clearProgress, isFinished, progressRatio } from '../../lib/continueWatching'
import { useProgress } from '../../hooks/useProgress'
import { getVodStreamUrl } from '../../lib/xtream'
import { CategoryColumn, ALL_GROUP } from '../CategoryColumn'
import {
  IconArrowLeft,
  IconChevronRight,
  IconGrid,
  IconMovie,
  IconPlay,
  IconSearch
} from '../Icons'
import { PosterCard, type PosterCardData } from './PosterCard'
import { PosterGrid } from './PosterGrid'
import { MovieDetail } from './MovieDetail'
import { SeriesDetail, episodeProgressId } from './SeriesDetail'

type Kind = 'vod' | 'series'
type Layout = 'showcase' | 'grid'
type Route =
  | { name: 'home' }
  | { name: 'category'; group: string }
  | { name: 'detail'; id: string; back: Route }

interface Entry {
  id: string
  name: string
  logo?: string
  group: string
  rating?: number
  year?: string
  added?: number
  backdrop?: string
  vod?: VodItem
  series?: SeriesItem
}

interface Props {
  kind: Kind
  vod: VodItem[]
  series: SeriesItem[]
  categoryOrder: string[]
  status: SectionStatus
  source: SourceConfig | null
  lockedGroups: string[]
  isLocked: (group: string) => boolean
  guard: (group: string, action: () => void) => void
  onPlay: (item: PlayableItem) => void
}

const ROW_LIMIT = 30
const layoutKey = (k: Kind): string => `iptv-toto-media-layout-${k}`

function loadLayout(k: Kind): Layout {
  try {
    return window.localStorage.getItem(layoutKey(k)) === 'grid' ? 'grid' : 'showcase'
  } catch {
    return 'showcase'
  }
}

function entryToPlayable(e: ContinueWatchingEntry): PlayableItem | null {
  if (!e.url) return null
  return {
    id: e.id,
    name: e.title,
    group: e.group || '',
    url: e.url,
    isLive: false,
    logo: e.logo,
    kind: e.kind,
    seriesId: e.seriesId,
    seriesName: e.seriesName,
    season: e.season,
    episodeNum: e.episodeNum
  }
}

// ---------- Vitrin satırları ----------

type HomeRow =
  | { type: 'hero'; entry: Entry }
  | {
      type: 'row'
      key: string
      title: string
      count?: number
      cards: PosterCardData[]
      onOpen: (id: string) => void
      onSeeAll?: () => void
    }

interface HomeRowProps {
  rows: HomeRow[]
  kind: Kind
  onHeroPlay: (e: Entry) => void
  onHeroInfo: (e: Entry) => void
}

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
      <div className="media-row-scroller" ref={ref}>
        {children}
      </div>
      <button className="row-arrow row-arrow-right" onClick={() => scroll(1)} aria-label="Sağa kaydır">
        <IconChevronRight size={18} />
      </button>
    </div>
  )
}

function HomeListRow({
  index,
  style,
  rows,
  kind,
  onHeroPlay,
  onHeroInfo
}: RowComponentProps<HomeRowProps>): ReactElement {
  const row = rows[index]
  if (row.type === 'hero') {
    const e = row.entry
    const bg = e.backdrop || e.logo
    return (
      <div style={style}>
        <div className="media-hero">
          {bg && <div className="media-hero-bg" style={{ backgroundImage: `url("${bg}")` }} />}
          <div className="media-hero-shade" />
          <div className="media-hero-content">
            {e.logo && <img className="media-hero-poster" src={e.logo} alt="" />}
            <div>
              <div className="media-hero-kicker">
                {kind === 'vod' ? 'Son eklenen film' : 'Öne çıkan dizi'}
              </div>
              <div className="media-hero-title">{e.name}</div>
              <div className="media-hero-meta">
                {e.year && <span>{e.year}</span>}
                {e.rating ? <span>★ {e.rating.toFixed(1)}</span> : null}
                <span>{e.group}</span>
              </div>
              <div className="media-hero-actions">
                <button className="btn-light" onClick={() => onHeroPlay(e)}>
                  <IconPlay size={14} /> {kind === 'vod' ? 'Oynat' : 'Bölümler'}
                </button>
                <button className="btn-glass" onClick={() => onHeroInfo(e)}>
                  Detaylar
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }
  return (
    <div style={style} className="media-row">
      <div className="media-row-head">
        <span className="media-row-title">{row.title}</span>
        {row.count !== undefined && <span className="media-row-count">{row.count}</span>}
        {row.onSeeAll && (
          <button className="media-row-more" onClick={row.onSeeAll}>
            Tümü <IconChevronRight size={14} />
          </button>
        )}
      </div>
      <RowScroller>
        {row.cards.map((c) => (
          <PosterCard key={c.id} data={c} onClick={() => row.onOpen(c.id)} />
        ))}
      </RowScroller>
    </div>
  )
}

// ---------- Ana bileşen ----------

export function MediaBrowser({
  kind,
  vod,
  series,
  categoryOrder,
  status,
  source,
  lockedGroups,
  isLocked,
  guard,
  onPlay
}: Props): ReactElement {
  const [route, setRoute] = useState<Route>({ name: 'home' })
  const [layout, setLayout] = useState<Layout>(() => loadLayout(kind))
  const [search, setSearch] = useState('')
  const [gridGroup, setGridGroup] = useState(ALL_GROUP)
  const { entries: progressEntries, byId: progressById } = useProgress()

  const entries = useMemo<Entry[]>(
    () =>
      kind === 'vod'
        ? vod.map((v) => ({
            id: v.id,
            name: v.name,
            logo: v.logo,
            group: v.group,
            rating: v.rating,
            added: v.added,
            vod: v
          }))
        : series.map((s) => ({
            id: s.id,
            name: s.name,
            logo: s.logo,
            group: s.group,
            rating: s.rating,
            year: s.year,
            backdrop: s.backdrop,
            series: s
          })),
    [kind, vod, series]
  )

  const entriesById = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries])

  const byGroup = useMemo(() => {
    const map = new Map<string, Entry[]>()
    for (const e of entries) {
      const list = map.get(e.group)
      if (list) list.push(e)
      else map.set(e.group, [e])
    }
    return map
  }, [entries])

  const orderedGroups = useMemo(() => {
    const known = categoryOrder.filter((g) => byGroup.has(g))
    const extra = Array.from(byGroup.keys()).filter((g) => !categoryOrder.includes(g))
    return [...known, ...extra]
  }, [categoryOrder, byGroup])

  // Dizi başına en son izlenen bölüm kaydı
  const seriesLatest = useMemo(() => {
    const map = new Map<number, ContinueWatchingEntry>()
    for (const e of progressEntries) {
      if (e.kind !== 'episode' || e.seriesId === undefined) continue
      const prev = map.get(e.seriesId)
      if (!prev || e.updatedAt > prev.updatedAt) map.set(e.seriesId, e)
    }
    return map
  }, [progressEntries])

  function toCard(e: Entry): PosterCardData {
    let progress: number | undefined
    let subtitle: string | undefined = e.year
    if (kind === 'vod') {
      const p = progressById.get(e.id)
      if (p && !isFinished(p)) progress = progressRatio(p)
    } else if (e.series) {
      const p = seriesLatest.get(e.series.seriesId)
      if (p) {
        subtitle = `S${p.season} · B${p.episodeNum}`
        if (!isFinished(p)) progress = progressRatio(p)
      }
    }
    return {
      id: e.id,
      title: e.name,
      subtitle,
      image: e.logo,
      rating: e.rating,
      progress,
      locked: isLocked(e.group)
    }
  }

  // ----- oynatma -----
  function playMovie(v: VodItem, fromStart: boolean): void {
    if (!source || source.type !== 'xtream') return
    if (fromStart) clearProgress(v.id)
    onPlay({
      id: v.id,
      name: v.name,
      group: v.group,
      url: getVodStreamUrl(source, v),
      isLive: false,
      logo: v.logo,
      kind: 'movie'
    })
  }

  function playEpisode(s: SeriesItem, ep: SeriesEpisode, fromStart: boolean): void {
    const id = episodeProgressId(ep)
    if (fromStart) clearProgress(id)
    onPlay({
      id,
      name: `${s.name} · ${ep.title}`,
      group: s.group,
      url: ep.url,
      isLive: false,
      logo: s.logo,
      kind: 'episode',
      seriesId: s.seriesId,
      seriesName: s.name,
      season: ep.season,
      episodeNum: ep.episodeNum
    })
  }

  function openDetail(id: string): void {
    const e = entriesById.get(id)
    if (!e) return
    guard(e.group, () => setRoute({ name: 'detail', id, back: route }))
  }

  // ----- İzlemeye devam et -----
  const continueList = useMemo(() => {
    if (kind === 'vod') {
      return progressEntries
        .filter((e) => e.kind === 'movie' && e.url && !isFinished(e))
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 20)
    }
    return Array.from(seriesLatest.values())
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 20)
  }, [kind, progressEntries, seriesLatest])

  function openContinue(id: string): void {
    const e = continueList.find((c) => c.id === id)
    if (!e) return
    guard(e.group || '', () => {
      if (kind === 'series' && isFinished(e) && e.seriesId !== undefined) {
        // Bölüm bitmiş: sonraki bölümü seçebilsin diye dizi sayfasını aç
        setRoute({ name: 'detail', id: `xtream-series-${e.seriesId}`, back: route })
        return
      }
      const playable = entryToPlayable(e)
      if (playable) onPlay(playable)
    })
  }

  // ----- Vitrin satırları -----
  const homeRows = useMemo<HomeRow[]>(() => {
    const rows: HomeRow[] = []
    const recent =
      kind === 'vod'
        ? [...entries].filter((e) => e.added).sort((a, b) => (b.added || 0) - (a.added || 0))
        : [...entries].filter((e) => (e.rating || 0) > 0).sort((a, b) => (b.rating || 0) - (a.rating || 0))

    const featured =
      recent.find((e) => e.logo && !isLocked(e.group)) ||
      entries.find((e) => e.logo && !isLocked(e.group))
    if (featured) rows.push({ type: 'hero', entry: featured })

    if (continueList.length > 0) {
      rows.push({
        type: 'row',
        key: 'continue',
        title: 'İzlemeye devam et',
        cards: continueList.map((e) => ({
          id: e.id,
          title: kind === 'series' ? e.seriesName || e.title : e.title,
          subtitle:
            kind === 'series'
              ? `S${e.season} · B${e.episodeNum}${isFinished(e) ? ' · izlendi' : ''}`
              : `${Math.max(0, Math.round((e.durationSeconds - e.positionSeconds) / 60))} dk kaldı`,
          image: e.logo,
          progress: isFinished(e) ? undefined : progressRatio(e),
          locked: isLocked(e.group || '')
        })),
        onOpen: openContinue
      })
    }

    if (recent.length > 0) {
      rows.push({
        type: 'row',
        key: 'recent',
        title: kind === 'vod' ? 'Son eklenenler' : 'En yüksek puanlılar',
        cards: recent.slice(0, ROW_LIMIT).map(toCard),
        onOpen: openDetail
      })
    }

    for (const g of orderedGroups) {
      const list = byGroup.get(g) || []
      rows.push({
        type: 'row',
        key: `g-${g}`,
        title: g,
        count: list.length,
        cards: isLocked(g) ? list.slice(0, 8).map(toCard) : list.slice(0, ROW_LIMIT).map(toCard),
        onOpen: openDetail,
        onSeeAll: () => guard(g, () => setRoute({ name: 'category', group: g }))
      })
    }
    return rows
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, entries, orderedGroups, byGroup, continueList, progressById, seriesLatest, lockedGroups, route])

  const searchResults = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr')
    if (!q) return null
    const out: PosterCardData[] = []
    for (const e of entries) {
      if (e.name.toLocaleLowerCase('tr').includes(q)) {
        out.push(toCard(e))
        if (out.length >= 600) break
      }
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, entries, progressById, seriesLatest, lockedGroups])

  function switchLayout(next: Layout): void {
    setLayout(next)
    setRoute({ name: 'home' })
    try {
      window.localStorage.setItem(layoutKey(kind), next)
    } catch {
      /* ignore */
    }
  }

  const label = kind === 'vod' ? 'film' : 'dizi'

  // ----- Detay sayfası -----
  if (route.name === 'detail') {
    const e = entriesById.get(route.id)
    const back = (): void => setRoute(route.back)
    if (e?.vod) {
      const v = e.vod
      return (
        <div className="media-browser">
          <MovieDetail
            item={v}
            source={source}
            progress={progressById.get(v.id)}
            onBack={back}
            onPlay={(fromStart) => playMovie(v, fromStart)}
          />
        </div>
      )
    }
    if (e?.series) {
      const s = e.series
      return (
        <div className="media-browser">
          <SeriesDetail
            item={s}
            source={source}
            entries={progressEntries}
            onBack={back}
            onPlayEpisode={(ep, fromStart) => playEpisode(s, ep, fromStart)}
          />
        </div>
      )
    }
  }

  const toolbar = (
    <div className="media-toolbar">
      {route.name === 'category' && !searchResults && (
        <button className="icon-btn" onClick={() => setRoute({ name: 'home' })} title="Geri">
          <IconArrowLeft size={15} />
        </button>
      )}
      <div className="media-toolbar-title">
        {route.name === 'category' && !searchResults
          ? route.group
          : kind === 'vod'
            ? 'Filmler'
            : 'Diziler'}
      </div>
      <div className="topbar-spacer" />
      <div className="pane-search media-search">
        <IconSearch size={14} />
        <input
          value={search}
          onChange={(ev) => setSearch(ev.target.value)}
          placeholder={`${entries.length.toLocaleString('tr-TR')} ${label} içinde ara`}
        />
      </div>
      <div className="seg-toggle">
        <button
          className={layout === 'showcase' ? 'active' : ''}
          onClick={() => switchLayout('showcase')}
          title="Vitrin görünümü"
        >
          <IconMovie size={13} /> Vitrin
        </button>
        <button
          className={layout === 'grid' ? 'active' : ''}
          onClick={() => switchLayout('grid')}
          title="Kategori + ızgara görünümü"
        >
          <IconGrid size={13} /> Izgara
        </button>
      </div>
    </div>
  )

  if (entries.length === 0) {
    return (
      <div className="media-browser">
        {toolbar}
        <div className="empty-state">
          {status === 'loading' ? (
            <>
              <div className="spinner" />
              <p>{kind === 'vod' ? 'Filmler' : 'Diziler'} yükleniyor…</p>
            </>
          ) : status === 'error' ? (
            <>
              <h3>{kind === 'vod' ? 'Filmler' : 'Diziler'} yüklenemedi</h3>
              <p>Üstteki yenile düğmesiyle tekrar deneyebilirsin.</p>
            </>
          ) : (
            <>
              <h3>Bu kaynakta {label} yok</h3>
              <p>Film ve diziler yalnızca Xtream Codes kaynaklarında listelenir.</p>
            </>
          )}
        </div>
      </div>
    )
  }

  let body: ReactElement
  if (searchResults) {
    body = (
      <>
        <div className="media-page-sub">
          “{search.trim()}” için {searchResults.length} sonuç
        </div>
        <PosterGrid items={searchResults} onOpen={openDetail} emptyText="Sonuç bulunamadı" />
      </>
    )
  } else if (layout === 'grid') {
    const list = gridGroup === ALL_GROUP ? entries : byGroup.get(gridGroup) || []
    body = (
      <div className="media-grid-layout">
        <CategoryColumn
          items={entries}
          activeGroup={gridGroup}
          onSelectGroup={(g) => guard(g, () => setGridGroup(g))}
          allLabel={kind === 'vod' ? 'Tüm filmler' : 'Tüm diziler'}
          orderedGroups={categoryOrder}
          lockedGroups={lockedGroups}
        />
        <PosterGrid items={list.map(toCard)} onOpen={openDetail} />
      </div>
    )
  } else if (route.name === 'category') {
    const list = byGroup.get(route.group) || []
    body = (
      <>
        <div className="media-page-sub">{list.length} {label}</div>
        <PosterGrid items={list.map(toCard)} onOpen={openDetail} />
      </>
    )
  } else {
    body = (
      <div className="media-scroll">
        <List
          rowComponent={HomeListRow}
          rowCount={homeRows.length}
          rowHeight={(index) => (homeRows[index].type === 'hero' ? 392 : 346)}
          rowProps={{
            rows: homeRows,
            kind,
            onHeroPlay: (e) => {
              if (e.vod) {
                const v = e.vod
                guard(e.group, () => playMovie(v, false))
              } else openDetail(e.id)
            },
            onHeroInfo: (e) => openDetail(e.id)
          }}
        />
      </div>
    )
  }

  return (
    <div className="media-browser">
      {toolbar}
      {body}
    </div>
  )
}
