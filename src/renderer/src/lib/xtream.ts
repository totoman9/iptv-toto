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
  tv_archive?: number | string
  tv_archive_duration?: number | string
}

interface XtreamVodStream {
  stream_id: number
  name: string
  stream_icon?: string
  category_id: string
  container_extension?: string
  rating?: string | number
  added?: string | number
}

interface XtreamSeries {
  series_id: number
  name: string
  cover?: string
  category_id: string
  rating?: string | number
  genre?: string
  releaseDate?: string
  backdrop_path?: string[] | string
}

function toNumber(v: string | number | undefined): number | undefined {
  if (v === undefined || v === null || v === '') return undefined
  const n = typeof v === 'number' ? v : parseFloat(v)
  return Number.isFinite(n) ? n : undefined
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

// Kategori listeleri küçük ama bazen ilk denemede zaman aşımına uğruyor;
// boş dönünce bütün içerik "Diğer" grubuna düşüyordu. Birkaç kez yeniden dene.
async function fetchCategories(url: string): Promise<{ data: XtreamCategory[] }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await window.iptv.http.fetchJson<XtreamCategory[]>(url, { timeoutMs: 20000 })
    if (res.ok && Array.isArray(res.data)) return { data: res.data }
    await new Promise((r) => setTimeout(r, 800 * (attempt + 1)))
  }
  return { data: [] }
}

export interface LiveChannelsResult {
  channels: Channel[]
  categoryOrder: string[]
}

// Kategorileri sağlayıcının döndürdüğü sırayla veriyoruz (alfabetik değil):
// çoğu panel TR kanallarını/kategorilerini en başa koyacak şekilde
// düzenlenmiştir, alfabetik sıralama bunu bozup [AR]/[BG] gibi kodları
// araya sokuyordu.
export async function getLiveChannels(cfg: XtreamSourceConfig): Promise<LiveChannelsResult> {
  const catsRes = await fetchCategories(
    apiUrl(cfg,'get_live_categories')
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
    streamId: s.stream_id,
    archiveDays: Number(s.tv_archive) === 1 ? toNumber(s.tv_archive_duration) || 1 : undefined
  }))
  const categoryOrder = (catsRes.data || []).map((c) => c.category_name)
  return { channels, categoryOrder }
}

export interface VodItemsResult {
  items: VodItem[]
  categoryOrder: string[]
}

export async function getVodItems(cfg: XtreamSourceConfig): Promise<VodItemsResult> {
  const catsRes = await fetchCategories(
    apiUrl(cfg,'get_vod_categories')
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
    containerExtension: s.container_extension || 'mp4',
    rating: toNumber(s.rating),
    added: toNumber(s.added)
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
    coverBig: info.cover_big || info.movie_image || info.backdrop_path?.[0] || undefined,
    backdrop: info.backdrop_path?.[0] || undefined
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

export interface SeriesListResult {
  items: SeriesItem[]
  categoryOrder: string[]
}

export async function getSeriesList(cfg: XtreamSourceConfig): Promise<SeriesListResult> {
  const catsRes = await fetchCategories(
    apiUrl(cfg,'get_series_categories')
  )
  const seriesRes = await window.iptv.http.fetchJson<XtreamSeries[]>(
    apiUrl(cfg, 'get_series'),
    { timeoutMs: BIG_LIST_TIMEOUT_MS }
  )
  if (!seriesRes.ok) throw new Error(seriesRes.error || 'Dizi listesi alınamadı')

  const catMap = new Map<string, string>()
  for (const c of catsRes.data || []) catMap.set(c.category_id, c.category_name)

  const items = (seriesRes.data || []).map((s) => {
    const backdrop = Array.isArray(s.backdrop_path) ? s.backdrop_path[0] : s.backdrop_path
    return {
      id: `xtream-series-${s.series_id}`,
      name: s.name,
      logo: s.cover,
      group: catMap.get(s.category_id) || 'Diğer',
      seriesId: s.series_id,
      rating: toNumber(s.rating),
      genre: s.genre || undefined,
      year: s.releaseDate ? String(s.releaseDate).slice(0, 4) : undefined,
      backdrop: backdrop || undefined
    }
  })
  const categoryOrder = (catsRes.data || []).map((c) => c.category_name)
  return { items, categoryOrder }
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
  // Sunucu hata verdiyse (ör. çok sık istek yüzünden geçici engel) boş
  // program listesiyle karıştırılmasın diye hata fırlat
  if (!res.ok) throw new Error(res.error || `Rehber alınamadı (${res.status ?? 'bağlantı yok'})`)
  const listings = res.data?.epg_listings || []
  return dedupePrograms(
    listings.map((entry) => ({
      title: decodeBase64Safe(entry.title),
      description: entry.description ? decodeBase64Safe(entry.description) : undefined,
      start: parseXtreamTime(entry.start_timestamp),
      end: parseXtreamTime(entry.stop_timestamp)
    }))
  )
}

// Bazı sağlayıcılar aynı saate iki program yazıyor (ör. "Dizi 22:00–02:15" ve
// "Evlilik Güzeldir 22:00–01:30"); rehberde üst üste biniyordu. Çakışanlardan
// daha kısa (daha belirgin) olanı tutuyoruz.
export function dedupePrograms(list: EpgProgram[]): EpgProgram[] {
  const sorted = [...list].sort((a, b) => a.start - b.start || a.end - a.start - (b.end - b.start))
  const out: EpgProgram[] = []
  for (const p of sorted) {
    const last = out[out.length - 1]
    if (last && p.start < last.end - 60_000) continue
    out.push(p)
  }
  return out
}

// Geriye dönük izleme (catch-up) adresi. Sağlayıcı bu kanalda arşiv tutuyorsa
// geçmiş bir programı baştan oynatır.
export function getTimeshiftUrl(
  cfg: XtreamSourceConfig,
  streamId: number,
  start: number,
  end: number
): string {
  const d = new Date(start)
  const pad = (n: number): string => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}:${pad(d.getHours())}-${pad(d.getMinutes())}`
  const minutes = Math.max(1, Math.round((end - start) / 60000))
  return `${cleanHost(cfg.host)}/timeshift/${cfg.username}/${cfg.password}/${minutes}/${stamp}/${streamId}.ts`
}

// Rehber istekleri arasındaki bekleme. IPTV panellerinin çoğu kısa sürede çok
// istek atan adresi geçici olarak engelliyor (flood koruması); bu yüzden
// istekleri seyrek atıyoruz.
export const EPG_REQUEST_GAP_MS = 400

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
  let failuresInRow = 0
  for (let i = 0; i < channels.length; i++) {
    const ch = channels[i]
    // Sunucu art arda hata veriyorsa (geçici engel) daha fazla istek atma
    if (failuresInRow >= 3) {
      results.push({ streamId: ch.streamId, name: ch.name, logo: ch.logo, programs: [] })
      continue
    }
    try {
      const programs = await getShortEpg(cfg, ch.streamId, 8)
      results.push({ streamId: ch.streamId, name: ch.name, logo: ch.logo, programs })
      failuresInRow = 0
    } catch {
      results.push({ streamId: ch.streamId, name: ch.name, logo: ch.logo, programs: [] })
      failuresInRow++
    }
    onProgress?.(i + 1, channels.length)
    // Sunucuyu yormamak için istekler arasında kısa bir ara
    await new Promise((r) => setTimeout(r, EPG_REQUEST_GAP_MS))
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
