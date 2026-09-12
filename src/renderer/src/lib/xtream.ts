import type {
  Channel,
  EpgProgram,
  MediaDetails,
  SeriesEpisode,
  SeriesItem,
  SeriesSeason,
  VodItem,
  XtreamSourceConfig
} from '../../../shared/types'

interface XtreamCategory {
  category_id: string
  category_name: string
}

interface XtreamLiveStream {
  stream_id: number
  name: string
  stream_icon?: string
  category_id: string
  epg_channel_id?: string
}

interface XtreamVodStream {
  stream_id: number
  name: string
  stream_icon?: string
  category_id: string
  container_extension?: string
}

interface XtreamSeries {
  series_id: number
  name: string
  cover?: string
  category_id: string
}

interface XtreamSeriesInfoEpisode {
  id: string
  title: string
  episode_num: number
  container_extension?: string
}

interface XtreamSeriesInfo {
  info?: {
    plot?: string
    cast?: string
    director?: string
    genre?: string
    releaseDate?: string
    rating?: string | number
    cover?: string
  }
  episodes: Record<string, XtreamSeriesInfoEpisode[]>
}

interface XtreamShortEpgEntry {
  title: string
  description?: string
  start_timestamp: string
  stop_timestamp: string
}

function cleanHost(host: string): string {
  return host.trim().replace(/\/+$/, '')
}

function apiUrl(cfg: XtreamSourceConfig, action: string, extra = ''): string {
  const host = cleanHost(cfg.host)
  return `${host}/player_api.php?username=${encodeURIComponent(cfg.username)}&password=${encodeURIComponent(cfg.password)}&action=${action}${extra}`
}

export async function testXtreamLogin(
  cfg: XtreamSourceConfig
): Promise<{ ok: boolean; error?: string; liveExtension?: 'm3u8' | 'ts' }> {
  const url = `${cleanHost(cfg.host)}/player_api.php?username=${encodeURIComponent(
    cfg.username
  )}&password=${encodeURIComponent(cfg.password)}`
  const res = await window.iptv.http.fetchJson<{
    user_info?: { auth: number; allowed_output_formats?: string[] }
  }>(url)
  if (!res.ok) return { ok: false, error: res.error || 'Sunucuya bağlanılamadı' }
  if (res.data?.user_info?.auth !== 1) {
    return { ok: false, error: 'Kullanıcı adı veya şifre hatalı görünüyor' }
  }
  // Bazı hesaplar yalnızca .ts çıktısına izin verir (m3u8 vermez). Hesabın
  // izin verdiği formatlara bakıp doğru olanı seçiyoruz.
  const formats = (res.data.user_info.allowed_output_formats || []).map((f) => f.toLowerCase())
  const liveExtension = !formats.includes('m3u8') && formats.includes('ts') ? 'ts' : 'm3u8'
  return { ok: true, liveExtension }
}

// Bazı Xtream panelleri onbinlerce kanal/film/dizi barındırır ve aynı anda
// birden fazla isteği kaldıramayabilir (tek bağlantıya sınırlı hesaplarda
// görüldü). Bu yüzden her liste için kategori + içerik isteğini art arda
// (paralel değil) atıyor, büyük listeler için de uzun bir zaman aşımı
// tanıyoruz.
const BIG_LIST_TIMEOUT_MS = 45000

export interface LiveChannelsResult {
  channels: Channel[]
  categoryOrder: string[]
}

// Kategorileri sağlayıcının döndürdüğü sırayla veriyoruz (alfabetik değil):
// çoğu panel TR kanallarını/kategorilerini en başa koyacak şekilde
// düzenlenmiştir, alfabetik sıralama bunu bozup [AR]/[BG] gibi kodları
// araya sokuyordu.
export async function getLiveChannels(cfg: XtreamSourceConfig): Promise<LiveChannelsResult> {
  const catsRes = await window.iptv.http.fetchJson<XtreamCategory[]>(
    apiUrl(cfg, 'get_live_categories')
  )
  const streamsRes = await window.iptv.http.fetchJson<XtreamLiveStream[]>(
    apiUrl(cfg, 'get_live_streams'),
    { timeoutMs: BIG_LIST_TIMEOUT_MS }
  )

  const catMap = new Map<string, string>()
  for (const c of catsRes.data || []) catMap.set(c.category_id, c.category_name)

  const host = cleanHost(cfg.host)
  const ext = cfg.liveExtension || 'm3u8'
  const channels = (streamsRes.data || []).map((s) => ({
    id: `xtream-live-${s.stream_id}`,
    name: s.name,
    logo: s.stream_icon,
    group: catMap.get(s.category_id) || 'Diğer',
    url: `${host}/live/${cfg.username}/${cfg.password}/${s.stream_id}.${ext}`,
    epgChannelId: s.epg_channel_id,
    streamId: s.stream_id
  }))
  const categoryOrder = (catsRes.data || []).map((c) => c.category_name)
  return { channels, categoryOrder }
}

export interface VodItemsResult {
  items: VodItem[]
  categoryOrder: string[]
}

export async function getVodItems(cfg: XtreamSourceConfig): Promise<VodItemsResult> {
  const catsRes = await window.iptv.http.fetchJson<XtreamCategory[]>(
    apiUrl(cfg, 'get_vod_categories')
  )
  const streamsRes = await window.iptv.http.fetchJson<XtreamVodStream[]>(
    apiUrl(cfg, 'get_vod_streams'),
    { timeoutMs: BIG_LIST_TIMEOUT_MS }
  )

  const catMap = new Map<string, string>()
  for (const c of catsRes.data || []) catMap.set(c.category_id, c.category_name)

  const items = (streamsRes.data || []).map((s) => ({
    id: `xtream-vod-${s.stream_id}`,
    name: s.name,
    logo: s.stream_icon,
    group: catMap.get(s.category_id) || 'Diğer',
    streamId: s.stream_id,
    containerExtension: s.container_extension || 'mp4'
  }))
  const categoryOrder = (catsRes.data || []).map((c) => c.category_name)
  return { items, categoryOrder }
}

export function getVodStreamUrl(cfg: XtreamSourceConfig, item: VodItem): string {
  const host = cleanHost(cfg.host)
  return `${host}/movie/${cfg.username}/${cfg.password}/${item.streamId}.${item.containerExtension}`
}

interface XtreamMediaInfo {
  plot?: string
  cast?: string
  director?: string
  genre?: string
  releasedate?: string
  release_date?: string
  rating?: string | number
  duration?: string
  movie_image?: string
  cover_big?: string
  backdrop_path?: string[]
}

function mapMediaInfo(info: XtreamMediaInfo | undefined): MediaDetails {
  if (!info) return {}
  return {
    plot: info.plot || undefined,
    cast: info.cast || undefined,
    director: info.director || undefined,
    genre: info.genre || undefined,
    releaseDate: info.releasedate || info.release_date || undefined,
    rating: info.rating !== undefined ? String(info.rating) : undefined,
    durationText: info.duration || undefined,
    coverBig: info.cover_big || info.movie_image || info.backdrop_path?.[0] || undefined
  }
}

export async function getVodDetails(
  cfg: XtreamSourceConfig,
  streamId: number
): Promise<MediaDetails> {
  const res = await window.iptv.http.fetchJson<{ info?: XtreamMediaInfo }>(
    apiUrl(cfg, 'get_vod_info', `&vod_id=${streamId}`)
  )
  return mapMediaInfo(res.data?.info)
}

export async function getSeriesList(cfg: XtreamSourceConfig): Promise<SeriesItem[]> {
  const catsRes = await window.iptv.http.fetchJson<XtreamCategory[]>(
    apiUrl(cfg, 'get_series_categories')
  )
  const seriesRes = await window.iptv.http.fetchJson<XtreamSeries[]>(
    apiUrl(cfg, 'get_series'),
    { timeoutMs: BIG_LIST_TIMEOUT_MS }
  )

  const catMap = new Map<string, string>()
  for (const c of catsRes.data || []) catMap.set(c.category_id, c.category_name)

  return (seriesRes.data || []).map((s) => ({
    id: `xtream-series-${s.series_id}`,
    name: s.name,
    logo: s.cover,
    group: catMap.get(s.category_id) || 'Diğer',
    seriesId: s.series_id
  }))
}

export interface SeriesSeasonsResult {
  seasons: SeriesSeason[]
  details: MediaDetails
}

export async function getSeriesSeasons(
  cfg: XtreamSourceConfig,
  seriesId: number
): Promise<SeriesSeasonsResult> {
  const res = await window.iptv.http.fetchJson<XtreamSeriesInfo>(
    apiUrl(cfg, 'get_series_info', `&series_id=${seriesId}`)
  )
  const host = cleanHost(cfg.host)
  const episodesBySeason = res.data?.episodes || {}

  const seasons = Object.entries(episodesBySeason)
    .map(([seasonNum, episodes]) => {
      const seasonEpisodes: SeriesEpisode[] = episodes.map((ep) => ({
        id: ep.id,
        title: ep.title,
        season: Number(seasonNum),
        episodeNum: ep.episode_num,
        url: `${host}/series/${cfg.username}/${cfg.password}/${ep.id}.${
          ep.container_extension || 'mp4'
        }`
      }))
      return { season: Number(seasonNum), episodes: seasonEpisodes }
    })
    .sort((a, b) => a.season - b.season)

  const info = res.data?.info
  const details: MediaDetails = info
    ? {
        plot: info.plot || undefined,
        cast: info.cast || undefined,
        director: info.director || undefined,
        genre: info.genre || undefined,
        releaseDate: info.releaseDate || undefined,
        rating: info.rating !== undefined ? String(info.rating) : undefined,
        coverBig: info.cover || undefined
      }
    : {}

  return { seasons, details }
}

export async function getShortEpg(
  cfg: XtreamSourceConfig,
  streamId: number,
  limit = 4
): Promise<EpgProgram[]> {
  const res = await window.iptv.http.fetchJson<{ epg_listings?: XtreamShortEpgEntry[] }>(
    apiUrl(cfg, 'get_short_epg', `&stream_id=${streamId}&limit=${limit}`)
  )
  const listings = res.data?.epg_listings || []
  return listings.map((entry) => ({
    title: decodeBase64Safe(entry.title),
    description: entry.description ? decodeBase64Safe(entry.description) : undefined,
    start: parseXtreamTime(entry.start_timestamp),
    end: parseXtreamTime(entry.stop_timestamp)
  }))
}

export interface EpgGridChannel {
  streamId: number
  name: string
  logo?: string
  programs: EpgProgram[]
}

// Tam TV rehberi ızgarası için birden fazla kanalın programını çeker.
// Sunucu aynı anda çok sayıda isteği kaldıramayabildiği için (bkz.
// get_live_streams/get_vod_streams'teki sıralı yaklaşım) burada da her
// kanalı sırayla, aralarında küçük bir gecikmeyle sorguluyoruz.
export async function getEpgGrid(
  cfg: XtreamSourceConfig,
  channels: { streamId: number; name: string; logo?: string }[],
  onProgress?: (done: number, total: number) => void
): Promise<EpgGridChannel[]> {
  const results: EpgGridChannel[] = []
  for (let i = 0; i < channels.length; i++) {
    const ch = channels[i]
    try {
      const programs = await getShortEpg(cfg, ch.streamId, 8)
      results.push({ streamId: ch.streamId, name: ch.name, logo: ch.logo, programs })
    } catch {
      results.push({ streamId: ch.streamId, name: ch.name, logo: ch.logo, programs: [] })
    }
    onProgress?.(i + 1, channels.length)
  }
  return results
}

function parseXtreamTime(value: string): number {
  // Xtream bazen unix saniye, bazen "YYYY-MM-DD HH:mm:ss" döner
  const asNumber = Number(value)
  if (!Number.isNaN(asNumber) && asNumber > 0) return asNumber * 1000
  const parsed = Date.parse(value.replace(' ', 'T'))
  return Number.isNaN(parsed) ? Date.now() : parsed
}

function decodeBase64Safe(value: string): string {
  try {
    return decodeURIComponent(escape(atob(value)))
  } catch {
    return value
  }
}
