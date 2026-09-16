import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { List, useListRef, type RowComponentProps } from 'react-window'
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
import {
  getSeriesSeasonsCached,
  getVodDetailsCached,
  getVodStreamUrl
} from '../../lib/xtream'
import { CategoryColumn, ALL_GROUP } from '../CategoryColumn'
import { usePersisted } from '../../lib/persisted'
import {
  followStore,
  getPreviousVisit,
  likedStore,
  toggleLike,
  toggleWatchlist,
  watchlistStore
} from '../../lib/library'
import { cleanTitle, lookupImdb } from '../../lib/omdb'
import { updateSettings } from '../../lib/settings'
import { useSettings } from '../../hooks/useSettings'
import { cardHeight, type PosterShape, type PosterSize } from '../../lib/theme'
import {
  IconArrowLeft,
  IconChevronRight,
  IconDice,
  IconEdit,
  IconFilter,
  IconBookmark,
  IconGrid,
  IconInfo,
  IconMovie,
  IconPlay,
  IconSearch
} from '../Icons'
import { PosterCard, cssUrl, type PosterCardData } from './PosterCard'
import { HoverPreview, type HoverTarget } from './HoverPreview'
import { QuickView } from './QuickView'
import { SkeletonPosterRows } from '../Skeleton'
import { PosterGrid } from './PosterGrid'
import { MovieDetail } from './MovieDetail'
import { SeriesDetail, episodeProgressId } from './SeriesDetail'

type Kind = 'vod' | 'series'
type Layout = 'showcase' | 'grid'
type Route =
  | { name: 'home' }
  | { name: 'category'; group: string }
  | { name: 'watchlist' }
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
  genres?: string[]
  updated?: number
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
  // Aramadan gelen "şu filmi/diziyi aç" isteği
  openRequest?: { id: string; nonce: number } | null
  onEditCategories?: () => void
  posterSize: PosterSize
  posterShape: PosterShape
}

const ROW_LIMIT = 30
// Vitrin satırının yüksekliği; vitrinin kendisi (CSS: .media-hero 540px)
// bundan uzun, ilk satır vitrinin solan alt kısmının üzerine biner.
const HERO_ROW_H = 480
const HERO_ROTATE_MS = 10_000

// Güne göre sabit ama ertesi gün değişen bir "rastgelelik" — vitrin ve
// "bugün senin için" gibi satırlar her açılışta aynı 4-5 şeyi göstermesin
// diye (uygulama canlılığı), ama gün içinde de sürekli değişip kararsız
// durmasın diye.
function daySeed(): number {
  const dayKey = new Date().toISOString().slice(0, 10)
  return Array.from(dayKey).reduce((sum, c) => sum + c.charCodeAt(0), 0)
}
function hashId(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return Math.abs(h)
}
const NEW_WINDOW_S = 7 * 24 * 3600

interface HeroExtra {
  plot?: string
  backdrop?: string
}

// Vitrindeki içeriğin özeti ve geniş görseli — her içerik için bir kez sorulur
const heroExtraCache = new Map<string, HeroExtra>()

interface Filters {
  genre: string | null
  year: 'all' | '2020' | '2010' | '2000' | 'old'
  rating: number
  sort: 'default' | 'rating' | 'year' | 'added' | 'az'
}

const DEFAULT_FILTERS: Filters = { genre: null, year: 'all', rating: 0, sort: 'default' }

const YEAR_OPTIONS: [Filters['year'], string][] = [
  ['all', 'Tüm yıllar'],
  ['2020', '2020 ve sonrası'],
  ['2010', '2010–2019'],
  ['2000', '2000–2009'],
  ['old', '2000 öncesi']
]
const RATING_OPTIONS: [number, string][] = [
  [0, 'Tüm puanlar'],
  [6, '6 ve üzeri'],
  [7, '7 ve üzeri'],
  [8, '8 ve üzeri']
]
const SORT_OPTIONS: [Filters['sort'], string][] = [
  ['default', 'Önerilen sıra'],
  ['rating', 'Puana göre'],
  ['year', 'Yeniden eskiye (yıl)'],
  ['added', 'Son eklenen'],
  ['az', 'A–Z']
]
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

// Süresi bilinmiyorsa (sağlayıcı bildirmediyse) "0 dk kaldı" yerine
function continueLabel(e: ContinueWatchingEntry): string {
  if (!(e.durationSeconds > 0) || !Number.isFinite(e.durationSeconds)) return 'Devam et'
  const min = Math.round((e.durationSeconds - e.positionSeconds) / 60)
  return min >= 1 ? `${min} dk kaldı` : 'Bitmek üzere'
}

// ---------- Vitrin satırları ----------

type HomeRow =
  | { type: 'hero'; entries: Entry[] }
  | {
      type: 'row'
      key: string
      title: string
      count?: number
      cards: PosterCardData[]
      onOpen: (id: string) => void
      onSeeAll?: () => void
    }
  | {
      type: 'top10'
      key: string
      title: string
      cards: PosterCardData[]
      onOpen: (id: string) => void
      source: 'provider' | 'imdb'
      loading: boolean
    }

type HoverStart = (el: HTMLElement, data: PosterCardData, onOpen: (id: string) => void, shape: PosterShape) => void

interface HomeRowProps {
  rows: HomeRow[]
  kind: Kind
  shape: PosterShape
  heroIndex: number
  heroExtra: Record<string, HeroExtra>
  top10Rank: Map<string, number>
  onHeroIndex: (i: number) => void
  onHeroHover: (paused: boolean) => void
  onHeroPlay: (e: Entry) => void
  onHeroInfo: (e: Entry) => void
  onHoverStart: HoverStart
  onHoverEnd: () => void
}

function RowScroller({ children, landscape }: { children: ReactElement[]; landscape?: boolean }): ReactElement {
  const ref = useRef<HTMLDivElement>(null)
  const scroll = (dir: 1 | -1): void => {
    const el = ref.current
    if (el) el.scrollBy({ left: dir * (el.clientWidth - 120), behavior: 'smooth' })
  }
  return (
    <div className={`media-row-scroller-wrap ${landscape ? 'is-landscape' : ''}`}>
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
  shape,
  heroIndex,
  heroExtra,
  top10Rank,
  onHeroIndex,
  onHeroHover,
  onHeroPlay,
  onHeroInfo,
  onHoverStart,
  onHoverEnd
}: RowComponentProps<HomeRowProps>): ReactElement {
  const row = rows[index]
  if (row.type === 'hero') {
    const e = row.entries[heroIndex % row.entries.length]
    const extra = heroExtra[e.id]
    const sharp = extra?.backdrop || e.backdrop
    const bg = sharp || e.logo
    const rank = top10Rank.get(e.id)
    return (
      <div style={style}>
        <div className="media-hero" onMouseEnter={() => onHeroHover(true)} onMouseLeave={() => onHeroHover(false)}>
          {bg && (
            <div
              key={bg}
              className={`media-hero-bg ${sharp ? 'is-sharp' : ''}`}
              style={{ backgroundImage: cssUrl(bg) }}
            />
          )}
          <div className="media-hero-shade" />
          <div className="media-hero-content" key={e.id}>
            {e.logo && !sharp && <img className="media-hero-poster" src={e.logo} alt="" />}
            <div>
              {rank !== undefined ? (
                <div className="media-hero-top10">
                  <b>
                    TOP<em>10</em>
                  </b>
                  Bugün {kind === 'vod' ? 'filmlerde' : 'dizilerde'} {rank + 1} numara
                </div>
              ) : (
                <div className="media-hero-kicker">{kind === 'vod' ? 'Son eklenen film' : 'Öne çıkan dizi'}</div>
              )}
              <div className="media-hero-title">{e.name}</div>
              <div className="media-hero-meta">
                {e.year && <span>{e.year}</span>}
                {e.rating ? <span>★ {e.rating.toFixed(1)}</span> : null}
                <span>{e.group}</span>
              </div>
              {extra?.plot && <p className="media-hero-plot">{extra.plot}</p>}
              <div className="media-hero-actions">
                <button className="btn-light" onClick={() => onHeroPlay(e)}>
                  <IconPlay size={14} /> {kind === 'vod' ? 'Oynat' : 'Bölümler'}
                </button>
                <button className="btn-glass" onClick={() => onHeroInfo(e)}>
                  <IconInfo size={15} /> Daha fazla bilgi
                </button>
              </div>
            </div>
          </div>
          {row.entries.length > 1 && (
            <div className="media-hero-dots">
              {row.entries.map((x, i) => (
                <button
                  key={x.id}
                  className={i === heroIndex % row.entries.length ? 'active' : ''}
                  onClick={() => onHeroIndex(i)}
                  aria-label={x.name}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }
  if (row.type === 'top10') {
    return (
      <div style={style} className="media-row">
        <div className="media-row-head">
          <span className="media-row-title">{row.title}</span>
          <span className="media-row-count">
            {row.source === 'imdb'
              ? row.loading
                ? 'IMDb puanları alınıyor…'
                : 'IMDb puanına göre'
              : 'Sağlayıcı puanına göre'}
          </span>
          <div className="seg-toggle seg-mini" title="Top 10 neye göre sıralansın?">
            <button
              className={row.source === 'provider' ? 'active' : ''}
              onClick={() => updateSettings({ top10Source: 'provider' })}
            >
              Sağlayıcı
            </button>
            <button
              className={row.source === 'imdb' ? 'active' : ''}
              onClick={() => updateSettings({ top10Source: 'imdb' })}
            >
              IMDb
            </button>
          </div>
        </div>
        <RowScroller>
          {row.cards.map((c, i) => (
            <div className={`top10-item ${i >= 9 ? 'is-wide' : ''}`} key={c.id}>
              <span className="top10-rank">
                <span>{i + 1}</span>
              </span>
              <PosterCard
                data={c}
                onClick={() => row.onOpen(c.id)}
                onHoverStart={(el, d) => onHoverStart(el, d, row.onOpen, 'portrait')}
                onHoverEnd={onHoverEnd}
              />
            </div>
          ))}
        </RowScroller>
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
      <RowScroller landscape={shape === 'landscape'}>
        {row.cards.map((c) => (
          <PosterCard
            key={c.id}
            data={c}
            shape={shape}
            onClick={() => row.onOpen(c.id)}
            onHoverStart={(el, d) => onHoverStart(el, d, row.onOpen, shape)}
            onHoverEnd={onHoverEnd}
          />
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
  onPlay,
  openRequest,
  onEditCategories,
  posterSize,
  posterShape
}: Props): ReactElement {
  const [route, setRoute] = useState<Route>({ name: 'home' })
  const [layout, setLayout] = useState<Layout>(() => loadLayout(kind))
  const [search, setSearch] = useState('')
  const [gridGroup, setGridGroup] = useState(ALL_GROUP)
  const [filterOpen, setFilterOpen] = useState(false)
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const watchlist = usePersisted(watchlistStore)
  const followed = usePersisted(followStore)
  const liked = usePersisted(likedStore)
  const { entries: progressEntries, byId: progressById } = useProgress()
  const settings = useSettings()
  const top10Source = settings.top10Source ?? 'provider'
  const [scrolled, setScrolled] = useState(false)

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
            year: cleanTitle(v.name).year,
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
            genres: s.genre ? s.genre.split(/[,/]/).map((g) => g.trim()).filter(Boolean) : undefined,
            updated: s.updated,
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
      backdrop: e.backdrop,
      rating: e.rating,
      progress,
      locked: isLocked(e.group),
      isNew: kind === 'vod' && !!e.added && Date.now() / 1000 - e.added < NEW_WINDOW_S,
      year: e.year,
      group: e.group
    }
  }

  // ----- oynatma -----
  async function playMovie(v: VodItem, fromStart: boolean, imdbId?: string): Promise<void> {
    if (!source || source.type !== 'xtream') return
    if (fromStart) clearProgress(v.id)
    // Sağlayıcının bildirdiği gerçek süre — akışın kendi tahminine göre daha
    // güvenilir olduğu için ilerleme çubuğu bunu kullanır (bkz. playerEngine).
    const details = await getVodDetailsCached(source, v.streamId)
    onPlay({
      id: v.id,
      name: v.name,
      group: v.group,
      url: getVodStreamUrl(source, v),
      isLive: false,
      logo: v.logo,
      kind: 'movie',
      imdbId,
      durationSeconds: details.durationSeconds
    })
  }

  function episodeItem(s: SeriesItem, ep: SeriesEpisode, seriesImdbId?: string): PlayableItem {
    return {
      id: episodeProgressId(ep),
      name: `${s.name} · ${ep.title}`,
      group: s.group,
      url: ep.url,
      isLive: false,
      logo: s.logo,
      kind: 'episode',
      seriesId: s.seriesId,
      seriesName: s.name,
      season: ep.season,
      episodeNum: ep.episodeNum,
      seriesImdbId,
      durationSeconds: ep.durationSeconds
    }
  }

  function playEpisode(
    s: SeriesItem,
    ep: SeriesEpisode,
    fromStart: boolean,
    all: SeriesEpisode[] = [],
    seriesImdbId?: string
  ): void {
    const item = episodeItem(s, ep, seriesImdbId)
    if (fromStart) clearProgress(item.id)
    // Sonraki bölümleri zincirle: bölüm bitince oynatıcı sıradakine geçer
    const idx = all.findIndex((e) => e.id === ep.id)
    let next: PlayableItem | undefined
    if (idx >= 0) {
      for (let i = all.length - 1; i > idx; i--) {
        next = { ...episodeItem(s, all[i], seriesImdbId), nextEpisode: next }
      }
    }
    onPlay({ ...item, nextEpisode: next })
  }

  function openDetail(id: string): void {
    const e = entriesById.get(id)
    if (!e) return
    guard(e.group, () => setRoute({ name: 'detail', id, back: route }))
  }

  // Aramadan gelen istek: liste yüklenince bir kez aç
  const handledOpen = useRef<number | null>(null)
  useEffect(() => {
    if (!openRequest || handledOpen.current === openRequest.nonce) return
    if (!entriesById.has(openRequest.id)) return
    handledOpen.current = openRequest.nonce
    openDetail(openRequest.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequest, entriesById])

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

  // "İzlemeye devam et" kartına tıklayınca da (diğer kartlar gibi) önce
  // detay sayfası açılır — "Devam Et" butonuna oradan basılır.
  function openContinue(id: string): void {
    const e = continueList.find((c) => c.id === id)
    if (!e) return
    guard(e.group || '', () => {
      const detailId = kind === 'series' && e.seriesId !== undefined ? `xtream-series-${e.seriesId}` : id
      if (entriesById.has(detailId)) {
        setRoute({ name: 'detail', id: detailId, back: route })
        return
      }
      // Katalogda bulunamadıysa (nadiren) en azından oynatmaya devam etsin
      const playable = entryToPlayable(e)
      if (playable) onPlay(playable)
    })
  }

  // ----- Vitrin (üst bant): en fazla 5 içerik, 10 sn'de bir döner -----
  const heroEntries = useMemo(() => {
    const pool =
      kind === 'vod'
        ? entries.filter((e) => e.added).sort((a, b) => (b.added || 0) - (a.added || 0))
        : entries
            .filter((e) => (e.rating || 0) > 0)
            .sort((a, b) => (b.backdrop ? 1 : 0) - (a.backdrop ? 1 : 0) || (b.rating || 0) - (a.rating || 0))
    const usable = pool.filter((e) => e.logo && !isLocked(e.group))
    // Hep aynı 5 kaliteli içerik yerine, güçlü bir aday havuzundan (ör. en
    // yeni/yüksek puanlı ~20) her gün farklı bir 5'li seçilip karıştırılıyor
    // — vitrin her açılışta aynı görünmesin diye.
    const seed = daySeed()
    const candidates = usable.slice(0, 20)
    const pick = [...candidates]
      .sort((a, b) => ((hashId(a.id) + seed) % 991) - ((hashId(b.id) + seed) % 991))
      .slice(0, 5)
    return pick.length ? pick : usable.slice(0, 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, entries, lockedGroups])

  const [heroIndex, setHeroIndex] = useState(0)
  const [heroPaused, setHeroPaused] = useState(false)
  const [heroExtra, setHeroExtra] = useState<Record<string, HeroExtra>>({})

  useEffect(() => {
    if (heroEntries.length < 2 || heroPaused) return
    const t = setInterval(() => setHeroIndex((i) => (i + 1) % heroEntries.length), HERO_ROTATE_MS)
    return () => clearInterval(t)
  }, [heroEntries.length, heroPaused])

  const heroEntry = heroEntries.length ? heroEntries[heroIndex % heroEntries.length] : undefined
  useEffect(() => {
    if (!heroEntry || !source || source.type !== 'xtream') return
    const cacheKey = `${source.id}:${heroEntry.id}`
    const cached = heroExtraCache.get(cacheKey)
    if (cached) {
      setHeroExtra((x) => (x[heroEntry.id] ? x : { ...x, [heroEntry.id]: cached }))
      return
    }
    let cancelled = false
    const load: Promise<HeroExtra> | null = heroEntry.vod
      ? getVodDetailsCached(source, heroEntry.vod.streamId).then((d) => ({ plot: d.plot, backdrop: d.backdrop }))
      : heroEntry.series
        ? getSeriesSeasonsCached(source, heroEntry.series.seriesId).then((r) => ({ plot: r.details.plot }))
        : null
    load
      ?.then((x) => {
        heroExtraCache.set(cacheKey, x)
        if (!cancelled) setHeroExtra((p) => ({ ...p, [heroEntry.id]: x }))
      })
      .catch(() => heroExtraCache.set(cacheKey, {}))
    return () => {
      cancelled = true
    }
  }, [heroEntry, source])

  // ----- Top 10: sağlayıcı puanı ya da (tercihe bağlı) IMDb puanı -----
  const top10Candidates = useMemo(() => {
    const usable = entries.filter((e) => e.logo && !isLocked(e.group))
    const rated = usable.filter((e) => (e.rating || 0) > 0).sort((a, b) => (b.rating || 0) - (a.rating || 0))
    if (rated.length >= 10) return rated.slice(0, 30)
    // Sağlayıcı puan vermiyorsa IMDb için son eklenenlerden aday seç
    return [...rated, ...usable.filter((e) => !(e.rating || 0)).sort((a, b) => (b.added || b.updated || 0) - (a.added || a.updated || 0))].slice(0, 30)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, lockedGroups])

  const [imdbRatings, setImdbRatings] = useState<Map<string, number> | null>(null)
  const [imdbLoading, setImdbLoading] = useState(false)

  useEffect(() => {
    if (top10Source !== 'imdb' || top10Candidates.length === 0) {
      setImdbRatings(null)
      setImdbLoading(false)
      return
    }
    let cancelled = false
    setImdbLoading(true)
    void (async () => {
      const ratings = new Map<string, number>()
      for (const e of top10Candidates) {
        if (cancelled) return
        const started = Date.now()
        try {
          const info = await lookupImdb([e.name], e.year, kind === 'vod' ? 'movie' : 'series')
          if (info?.rating) ratings.set(e.id, info.rating)
        } catch {
          // Anahtar/limit hatası: elimizdekilerle yetin
          break
        }
        // Önbellekten gelmediyse OMDb'yi yormamak için kısa ara
        if (Date.now() - started > 40) await new Promise((r) => setTimeout(r, 250))
      }
      if (!cancelled) {
        setImdbRatings(ratings)
        setImdbLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [top10Source, top10Candidates, kind])

  const top10 = useMemo(() => {
    if (top10Source === 'imdb' && imdbRatings && imdbRatings.size >= 3) {
      return top10Candidates
        .filter((e) => imdbRatings.has(e.id))
        .sort((a, b) => imdbRatings.get(b.id)! - imdbRatings.get(a.id)!)
        .slice(0, 10)
        .map((e) => ({ e, rating: imdbRatings.get(e.id) }))
    }
    return top10Candidates
      .filter((e) => (e.rating || 0) > 0)
      .slice(0, 10)
      .map((e) => ({ e, rating: e.rating }))
  }, [top10Source, imdbRatings, top10Candidates])

  const top10Rank = useMemo(() => new Map(top10.map(({ e }, i) => [e.id, i])), [top10])

  // Ana sanal listenin kaydırılabilir DOM öğesi — önizleme kartı üzerinde
  // fare tekerleği çevrilince kaydırmayı buraya elle aktarmak için gerekiyor.
  const homeListRef = useListRef(null)

  // ----- Üzerine gelince açılan önizleme -----
  const [hover, setHover] = useState<HoverTarget | null>(null)
  const startHover = useCallback<HoverStart>((el, data, onOpen, shape) => {
    setHover({ data, rect: el.getBoundingClientRect(), onOpen, shape })
  }, [])
  // PosterCard'ın kendi açılış gecikmesini (bekleme sırasında fareyi çekince)
  // iptal etmesi dışında burada yapacak bir şey yok — kapanma artık aşağıdaki
  // "fare, kart ya da önizlemenin üzerinde mi" takibiyle yönetiliyor.
  const endHover = useCallback(() => {}, [])
  // Netflix'teki gibi: önizleme açıkken kapanma, tek bir elemandan
  // ayrılma/girme olayına değil, farenin gerçekten kartın VE büyümüş
  // önizlemenin ikisinin de dışında kalıp kalmadığına bakılarak karar
  // veriliyor. Önceki onMouseEnter/Leave çifti, önizleme büyürken ya da
  // kart ile önizleme birebir çakışmayınca (ör. dikey afişte önizleme
  // 16:9 olduğundan üstte/altta küçük boşluklar kalıyordu) yanlışlıkla
  // kapanıp hemen yeniden açılmaya (titreşim) yol açıyordu.
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
      const overCard = inRect(hover.rect, e.clientX, e.clientY, 8)
      const previewEl = document.querySelector('.hover-preview')
      const overPreview = previewEl ? inRect(previewEl.getBoundingClientRect(), e.clientX, e.clientY, 8) : false
      if (overCard || overPreview) cancelScheduledClose()
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
    if (!hover) return
    // Önizleme kartı sayfanın geri kalanının dışında (bkz. HoverPreview'daki
    // portal) çizildiği için üzerine gelip fare tekerleğini çevirince sayfa
    // hiç kaymıyordu — tekerlek olayı, kaydırılabilen listenin dışına
    // düştüğü için tarayıcı hiçbir şeyi kaydırmıyordu. Kart üzerindeyken
    // tekerlek hareketini elle asıl listeye aktarıyoruz.
    const onWheel = (e: WheelEvent): void => {
      const target = e.target as HTMLElement | null
      if (target?.closest('.hover-preview')) {
        // Kartın/kutunun üzerindeyken (Mac'te iki parmakla kaydırma dahil)
        // kaydırma listeye aktarılıyor ama önizleme AÇIK kalıyor — kapanma
        // yalnızca fare gerçekten kutunun dışına çıkınca oluyor (yukarıdaki
        // mousemove takibiyle).
        const el = homeListRef.current?.element
        if (el) {
          e.preventDefault()
          el.scrollBy({ top: e.deltaY })
        }
        return
      }
      // Kutunun dışında bir yerde kaydırma oluyorsa (ör. fare başka satırın
      // üzerinde) önizleme açık kalmasın
      setHover(null)
    }
    const close = (): void => setHover(null)
    window.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('resize', close)
    }
  }, [hover])

  useEffect(() => {
    setHover(null)
  }, [route, layout, search, filters])


  // Önizleme kartındaki süre bilgisi — kart açılır açılmaz (450ms gecikmeden
  // sonra zaten) bir kez sorulup önbelleğe alınıyor (bkz. getVodDetailsCached).
  const [hoverDuration, setHoverDuration] = useState<Record<string, string>>({})
  useEffect(() => {
    if (!hover || !source || source.type !== 'xtream') return
    const e = entriesById.get(hover.data.id)
    if (!e || hoverDuration[e.id] !== undefined) return
    let cancelled = false
    const load = e.vod
      ? getVodDetailsCached(source, e.vod.streamId).then((d) => d.durationText)
      : e.series
        ? getSeriesSeasonsCached(source, e.series.seriesId).then(
            (r) => `${r.seasons.length} sezon`
          )
        : null
    load?.then((text) => {
      if (!cancelled) setHoverDuration((p) => ({ ...p, [e.id]: text || '' }))
    })
    return () => {
      cancelled = true
    }
  }, [hover, source, entriesById, hoverDuration])

  // ----- Genişletilmiş önizleme (QuickView) -----
  const [quickView, setQuickView] = useState<{ id: string } | null>(null)
  const [quickViewDetails, setQuickViewDetails] = useState<{ plot?: string; durationText?: string } | null>(null)
  const quickViewEntry = quickView ? entriesById.get(quickView.id) : undefined

  useEffect(() => {
    if (!quickViewEntry || !source || source.type !== 'xtream') {
      setQuickViewDetails(quickViewEntry ? {} : null)
      return
    }
    setQuickViewDetails(null)
    let cancelled = false
    const load = quickViewEntry.vod
      ? getVodDetailsCached(source, quickViewEntry.vod.streamId).then((d) => ({
          plot: d.plot,
          durationText: d.durationText
        }))
      : quickViewEntry.series
        ? getSeriesSeasonsCached(source, quickViewEntry.series.seriesId).then((r) => ({
            plot: r.details.plot,
            durationText: `${r.seasons.length} sezon`
          }))
        : Promise.resolve({})
    load.then((d) => {
      if (!cancelled) setQuickViewDetails(d)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickViewEntry?.id, source])

  // ----- Vitrin satırları -----
  const homeRows = useMemo<HomeRow[]>(() => {
    const rows: HomeRow[] = []
    const recent =
      kind === 'vod'
        ? [...entries].filter((e) => e.added).sort((a, b) => (b.added || 0) - (a.added || 0))
        : [...entries].filter((e) => (e.rating || 0) > 0).sort((a, b) => (b.rating || 0) - (a.rating || 0))

    if (heroEntries.length > 0) rows.push({ type: 'hero', entries: heroEntries })

    // Bugün senin için seçtiklerimiz — gün boyunca sabit kalan (ertesi gün
    // değişen), izlemekte olduğun ya da listende olanları tekrar önermeyen
    // bir seçki. Gerçek bir öneri motoru değil, ama her gün aynı kalmayan
    // basit ve tutarlı bir karışım.
    const dayKey = new Date().toISOString().slice(0, 10)
    const daySeed = Array.from(dayKey).reduce((sum, c) => sum + c.charCodeAt(0), 0)
    const hashId = (id: string): number => {
      let h = 0
      for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
      return Math.abs(h)
    }
    const alreadyShown = new Set<string>([
      ...continueList.map((c) => c.id),
      ...watchlist.filter((w) => w.kind === kind).map((w) => w.id)
    ])
    const picksForToday = entries
      .filter((e) => e.logo && !isLocked(e.group) && !alreadyShown.has(e.id))
      .sort((a, b) => (hashId(a.id) + daySeed) % 997 - ((hashId(b.id) + daySeed) % 997))
      .slice(0, ROW_LIMIT)
    if (picksForToday.length > 0) {
      rows.push({
        type: 'row',
        key: 'daily-picks',
        title: 'Bugün senin için seçtiklerimiz',
        cards: picksForToday.map(toCard),
        onOpen: openDetail
      })
    }

    if (top10.length >= 3) {
      rows.push({
        type: 'top10',
        key: 'top10',
        title: kind === 'vod' ? 'Filmlerde bugün 10 numara' : 'Dizilerde bugün 10 numara',
        cards: top10.map(({ e, rating }) => ({ ...toCard(e), rating })),
        onOpen: openDetail,
        source: top10Source,
        loading: top10Source === 'imdb' && imdbLoading
      })
    }

    // "İzlemeye devam et" satırı en üstte (vitrinin hemen altında) değil,
    // biraz daha aşağıda gösteriliyor — bkz. bu useMemo'nun sonu.
    const continueRow: HomeRow | null =
      continueList.length > 0
        ? {
            type: 'row',
            key: 'continue',
            title: 'İzlemeye devam et',
            cards: continueList.map((e) => ({
              id: e.id,
              title: kind === 'series' ? e.seriesName || e.title : e.title,
              subtitle:
                kind === 'series'
                  ? `S${e.season} · B${e.episodeNum}${isFinished(e) ? ' · izlendi' : ''}`
                  : continueLabel(e),
              image: e.logo,
              progress: isFinished(e) ? undefined : progressRatio(e),
              locked: isLocked(e.group || '')
            })),
            onOpen: openContinue
          }
        : null

    // Takip ettiğin diziler (yeni bölüm rozetiyle)
    if (kind === 'series' && followed.length > 0) {
      const cards = followed.flatMap((f) => {
        const e = entriesById.get(`xtream-series-${f.seriesId}`)
        return e ? [{ ...toCard(e), badge: f.newCount > 0 ? `${f.newCount} yeni bölüm` : undefined }] : []
      })
      if (cards.length) rows.push({ type: 'row', key: 'followed', title: 'Takip ettiğin diziler', cards, onOpen: openDetail })
    }


    // Son ziyaretinden beri eklenenler
    const since = getPreviousVisit(kind)
    if (since) {
      const stamp = (e: Entry): number => (kind === 'vod' ? e.added : e.updated) || 0
      const fresh = entries.filter((e) => stamp(e) * 1000 > since).sort((a, b) => stamp(b) - stamp(a))
      if (fresh.length) {
        rows.push({
          type: 'row',
          key: 'new-since',
          title: 'Son ziyaretinden beri eklenenler',
          count: fresh.length,
          cards: fresh.slice(0, ROW_LIMIT).map(toCard),
          onOpen: openDetail
        })
      }
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

    if (continueRow) rows.push(continueRow)

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
  }, [kind, entries, orderedGroups, byGroup, continueList, progressById, seriesLatest, lockedGroups, route, watchlist, followed, heroEntries, top10, top10Source, imdbLoading])

  // İzleme listem — artık vitrinde satır olarak değil, araç çubuğundaki
  // "İzleme listem" düğmesiyle ayrı bir sayfa olarak açılıyor.
  const watchlistCards = useMemo(
    () =>
      watchlist
        .filter((w) => w.kind === kind)
        .flatMap((w) => {
          const e = entriesById.get(w.id)
          return e ? [toCard(e)] : []
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [watchlist, kind, entriesById, progressById, seriesLatest, lockedGroups]
  )

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

  // ----- Filtreler, "Ne izlesem?", benzer içerikler -----
  const filterActive =
    filters.genre !== null || filters.year !== 'all' || filters.rating > 0 || filters.sort !== 'default'

  const topGenres = useMemo(() => {
    const counts = new Map<string, number>()
    for (const e of entries) for (const g of e.genres || []) counts.set(g, (counts.get(g) || 0) + 1)
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 14)
      .map(([g]) => g)
  }, [entries])

  const filtered = useMemo(() => {
    if (!filterActive) return []
    const yearOk = (y?: string): boolean => {
      if (filters.year === 'all') return true
      const n = y ? parseInt(y, 10) : NaN
      if (!Number.isFinite(n)) return false
      if (filters.year === '2020') return n >= 2020
      if (filters.year === '2010') return n >= 2010 && n < 2020
      if (filters.year === '2000') return n >= 2000 && n < 2010
      return n < 2000
    }
    const list = entries.filter(
      (e) =>
        !isLocked(e.group) &&
        (!filters.genre || e.genres?.includes(filters.genre)) &&
        yearOk(e.year) &&
        (filters.rating === 0 || (e.rating ?? 0) >= filters.rating)
    )
    const stamp = (e: Entry): number => (e.added ?? e.updated) || 0
    if (filters.sort === 'rating') list.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    else if (filters.sort === 'year') list.sort((a, b) => parseInt(b.year || '0', 10) - parseInt(a.year || '0', 10))
    else if (filters.sort === 'added') list.sort((a, b) => stamp(b) - stamp(a))
    else if (filters.sort === 'az') list.sort((a, b) => a.name.localeCompare(b.name, 'tr'))
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterActive, filters, entries, lockedGroups])

  function pickRandom(): void {
    const base = filterActive ? filtered : entries
    const pool = base.filter(
      (e) => !isLocked(e.group) && e.logo && (!e.rating || e.rating >= 6.5) && !progressById.get(e.id)
    )
    const from = pool.length ? pool : base.filter((e) => !isLocked(e.group))
    const choice = from[Math.floor(Math.random() * from.length)]
    if (choice) openDetail(choice.id)
  }

  function similarTo(e: Entry): PosterCardData[] {
    const genres = new Set(e.genres || [])
    return entries
      .filter((x) => x.id !== e.id && !isLocked(x.group) && (x.group === e.group || x.genres?.some((g) => genres.has(g))))
      .map((x) => ({
        x,
        score:
          (x.group === e.group ? 2 : 0) + (x.genres?.filter((g) => genres.has(g)).length || 0) + (x.rating || 0) / 4
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 18)
      .map(({ x }) => toCard(x))
  }

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
        <div className="media-browser" key={route.id}>
          <MovieDetail
            item={v}
            source={source}
            progress={progressById.get(v.id)}
            onBack={back}
            onPlay={(fromStart, imdbId) => playMovie(v, fromStart, imdbId)}
            similar={similarTo(e)}
            onOpenSimilar={openDetail}
          />
        </div>
      )
    }
    if (e?.series) {
      const s = e.series
      return (
        <div className="media-browser" key={route.id}>
          <SeriesDetail
            item={s}
            source={source}
            entries={progressEntries}
            onBack={back}
            onPlayEpisode={(ep, fromStart, all, imdbId) => playEpisode(s, ep, fromStart, all, imdbId)}
            similar={similarTo(e)}
            onOpenSimilar={openDetail}
          />
        </div>
      )
    }
  }

  const toolbar = (
    <div className="media-toolbar">
      {(route.name === 'category' || route.name === 'watchlist') && !searchResults && (
        <button className="icon-btn" onClick={() => setRoute({ name: 'home' })} title="Geri">
          <IconArrowLeft size={15} />
        </button>
      )}
      <div className="media-toolbar-title">
        {searchResults
          ? kind === 'vod'
            ? 'Filmler'
            : 'Diziler'
          : route.name === 'category'
            ? route.group
            : route.name === 'watchlist'
              ? 'İzleme listem'
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
      {onEditCategories && (
        <button className="icon-btn" onClick={onEditCategories} title="Kategorileri düzenle (gizle / sabitle)">
          <IconEdit size={14} />
        </button>
      )}
      <button
        className={`icon-btn ${filterOpen || filterActive ? 'icon-btn-on' : ''}`}
        onClick={() => setFilterOpen((v) => !v)}
        title="Filtrele ve sırala: tür, yıl, puan"
      >
        <IconFilter size={15} />
      </button>
      <button className="icon-btn" onClick={pickRandom} title="Ne izlesem? Beğenebileceğin rastgele bir öneri">
        <IconDice size={15} />
      </button>
      <button
        className={`icon-btn ${route.name === 'watchlist' ? 'icon-btn-on' : ''}`}
        onClick={() => setRoute((r) => (r.name === 'watchlist' ? { name: 'home' } : { name: 'watchlist' }))}
        title="İzleme listem"
      >
        <IconBookmark size={15} />
        {watchlistCards.length > 0 && <span className="icon-btn-badge">{watchlistCards.length}</span>}
      </button>
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

  const filterBar = filterOpen ? (
    <div className="filter-bar">
      {topGenres.length > 0 && (
        <div className="filter-chips">
          <button
            className={`chip-btn ${!filters.genre ? 'active' : ''}`}
            onClick={() => setFilters((f) => ({ ...f, genre: null }))}
          >
            Tüm türler
          </button>
          {topGenres.map((g) => (
            <button
              key={g}
              className={`chip-btn ${filters.genre === g ? 'active' : ''}`}
              onClick={() => setFilters((f) => ({ ...f, genre: f.genre === g ? null : g }))}
            >
              {g}
            </button>
          ))}
        </div>
      )}
      <div className="filter-selects">
        <select
          className="source-select"
          value={filters.year}
          onChange={(ev) => setFilters((f) => ({ ...f, year: ev.target.value as Filters['year'] }))}
          title="Yapım yılı"
        >
          {YEAR_OPTIONS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select
          className="source-select"
          value={filters.rating}
          onChange={(ev) => setFilters((f) => ({ ...f, rating: Number(ev.target.value) }))}
          title="En düşük puan"
        >
          {RATING_OPTIONS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select
          className="source-select"
          value={filters.sort}
          onChange={(ev) => setFilters((f) => ({ ...f, sort: ev.target.value as Filters['sort'] }))}
          title="Sıralama"
        >
          {SORT_OPTIONS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        {filterActive && (
          <button className="btn-secondary btn-sm" onClick={() => setFilters(DEFAULT_FILTERS)}>
            Filtreyi temizle
          </button>
        )}
      </div>
    </div>
  ) : null

  if (entries.length === 0) {
    if (status === 'loading') {
      return (
        <div className="media-browser">
          {toolbar}
          <SkeletonPosterRows />
        </div>
      )
    }
    return (
      <div className="media-browser">
        {toolbar}
        <div className="empty-state">
          {status === 'error' ? (
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

  const gridProps = {
    shape: posterShape,
    size: posterSize,
    onHoverStart: (el: HTMLElement, d: PosterCardData) => startHover(el, d, openDetail, posterShape),
    onHoverEnd: endHover
  }
  const rowH = cardHeight(posterSize, posterShape) + 72
  const top10H = cardHeight(posterSize, 'portrait') + 80

  let body: ReactElement
  let isHome = false
  if (searchResults) {
    body = (
      <>
        <div className="media-page-sub">
          “{search.trim()}” için {searchResults.length} sonuç
        </div>
        <PosterGrid items={searchResults} onOpen={openDetail} emptyText="Sonuç bulunamadı" {...gridProps} />
      </>
    )
  } else if (filterActive) {
    body = (
      <>
        <div className="media-page-sub">
          Filtreye uyan {filtered.length.toLocaleString('tr-TR')} {label}
        </div>
        <PosterGrid
          items={filtered.map(toCard)}
          onOpen={openDetail}
          emptyText="Bu filtreye uyan içerik yok"
          {...gridProps}
        />
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
          onEdit={onEditCategories}
        />
        <PosterGrid items={list.map(toCard)} onOpen={openDetail} {...gridProps} />
      </div>
    )
  } else if (route.name === 'category') {
    const list = byGroup.get(route.group) || []
    body = (
      <>
        <div className="media-page-sub">{list.length} {label}</div>
        <PosterGrid items={list.map(toCard)} onOpen={openDetail} {...gridProps} />
      </>
    )
  } else if (route.name === 'watchlist') {
    body = (
      <>
        <div className="media-page-sub">{watchlistCards.length} {label}</div>
        <PosterGrid
          items={watchlistCards}
          onOpen={openDetail}
          emptyText={`Henüz izleme listene ${label} eklemedin. Afişin üzerine gelip + düğmesine basarak ekleyebilirsin.`}
          {...gridProps}
        />
      </>
    )
  } else {
    isHome = !filterOpen
    body = (
      <div className="media-scroll">
        <List
          key={`${posterShape}-${posterSize}`}
          listRef={homeListRef}
          rowComponent={HomeListRow}
          rowCount={homeRows.length}
          overscanCount={3}
          rowHeight={(index) =>
            homeRows[index].type === 'hero' ? HERO_ROW_H : homeRows[index].type === 'top10' ? top10H : rowH
          }
          onScroll={(ev) => setScrolled(ev.currentTarget.scrollTop > 30)}
          rowProps={{
            rows: homeRows,
            kind,
            shape: posterShape,
            heroIndex,
            heroExtra,
            top10Rank,
            onHeroIndex: setHeroIndex,
            onHeroHover: setHeroPaused,
            onHeroPlay: (e) => {
              if (e.vod) {
                const v = e.vod
                guard(e.group, () => playMovie(v, false))
              } else openDetail(e.id)
            },
            onHeroInfo: (e) => openDetail(e.id),
            onHoverStart: startHover,
            onHoverEnd: endHover
          }}
        />
      </div>
    )
  }

  const hoverEntry = hover ? entriesById.get(hover.data.id) : undefined
  const closeHoverThen = (fn: () => void) => () => {
    setHover(null)
    fn()
  }

  return (
    <div className={`media-browser ${isHome ? 'is-home' : ''} ${isHome && scrolled ? 'is-scrolled' : ''}`}>
      {toolbar}
      {filterBar}
      {body}
      {hover && (
        <HoverPreview
          key={hover.data.id}
          target={hover}
          genres={hoverEntry?.genres}
          durationText={hoverDuration[hover.data.id]}
          inList={watchlist.some((w) => w.id === hover.data.id)}
          canList={!!hoverEntry}
          liked={liked.includes(hover.data.id)}
          playLabel={hoverEntry?.vod ? 'Oynat' : kind === 'series' ? 'Bölümler' : 'Aç'}
          onEnter={() => {}}
          onLeave={() => {}}
          onPlay={closeHoverThen(() => {
            const v = hoverEntry?.vod
            if (hoverEntry && v) guard(hoverEntry.group, () => playMovie(v, false))
            else hover.onOpen(hover.data.id)
          })}
          onToggleList={() => {
            if (hoverEntry)
              toggleWatchlist({
                id: hoverEntry.id,
                kind,
                name: hoverEntry.name,
                logo: hoverEntry.logo,
                group: hoverEntry.group
              })
          }}
          onToggleLike={() => toggleLike(hover.data.id)}
          onInfo={() => {
            const id = hover.data.id
            setHover(null)
            setQuickView({ id })
          }}
        />
      )}
      {quickView && quickViewEntry && (
        <QuickView
          data={toCard(quickViewEntry)}
          kind={kind === 'vod' ? 'movie' : 'series'}
          genres={quickViewEntry.genres}
          plot={quickViewDetails?.plot}
          durationText={quickViewDetails?.durationText}
          loading={quickViewDetails === null}
          inList={watchlist.some((w) => w.id === quickView.id)}
          canList
          liked={liked.includes(quickView.id)}
          playLabel={quickViewEntry.vod ? 'Oynat' : kind === 'series' ? 'Bölümler' : 'Aç'}
          onClose={() => setQuickView(null)}
          onPlay={() => {
            const v = quickViewEntry.vod
            setQuickView(null)
            if (v) guard(quickViewEntry.group, () => playMovie(v, false))
            else openDetail(quickView.id)
          }}
          onToggleList={() =>
            toggleWatchlist({
              id: quickViewEntry.id,
              kind,
              name: quickViewEntry.name,
              logo: quickViewEntry.logo,
              group: quickViewEntry.group
            })
          }
          onToggleLike={() => toggleLike(quickView.id)}
          onOpenFull={() => {
            const id = quickView.id
            setQuickView(null)
            openDetail(id)
          }}
        />
      )}
    </div>
  )
}
