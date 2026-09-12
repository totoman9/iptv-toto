import type {
  Channel,
  EpgProgram,
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
): Promise<{ ok: boolean; error?: string }> {
  const url = `${cleanHost(cfg.host)}/player_api.php?username=${encodeURIComponent(
    cfg.username
  )}&password=${encodeURIComponent(cfg.password)}`
  const res = await window.iptv.http.fetchJson<{ user_info?: { auth: number } }>(url)
  if (!res.ok) return { ok: false, error: res.error || 'Sunucuya bağlanılamadı' }
  if (res.data?.user_info?.auth !== 1) {
    return { ok: false, error: 'Kullanıcı adı veya şifre hatalı görünüyor' }
  }
  return { ok: true }
}

export async function getLiveChannels(cfg: XtreamSourceConfig): Promise<Channel[]> {
  const [catsRes, streamsRes] = await Promise.all([
    window.iptv.http.fetchJson<XtreamCategory[]>(apiUrl(cfg, 'get_live_categories')),
    window.iptv.http.fetchJson<XtreamLiveStream[]>(apiUrl(cfg, 'get_live_streams'))
  ])

  const catMap = new Map<string, string>()
  for (const c of catsRes.data || []) catMap.set(c.category_id, c.category_name)

  const host = cleanHost(cfg.host)
  return (streamsRes.data || []).map((s) => ({
    id: `xtream-live-${s.stream_id}`,
    name: s.name,
    logo: s.stream_icon,
    group: catMap.get(s.category_id) || 'Diğer',
    url: `${host}/live/${cfg.username}/${cfg.password}/${s.stream_id}.m3u8`,
    epgChannelId: s.epg_channel_id,
    streamId: s.stream_id
  }))
}

export async function getVodItems(cfg: XtreamSourceConfig): Promise<VodItem[]> {
  const [catsRes, streamsRes] = await Promise.all([
    window.iptv.http.fetchJson<XtreamCategory[]>(apiUrl(cfg, 'get_vod_categories')),
    window.iptv.http.fetchJson<XtreamVodStream[]>(apiUrl(cfg, 'get_vod_streams'))
  ])

  const catMap = new Map<string, string>()
  for (const c of catsRes.data || []) catMap.set(c.category_id, c.category_name)

  return (streamsRes.data || []).map((s) => ({
    id: `xtream-vod-${s.stream_id}`,
    name: s.name,
    logo: s.stream_icon,
    group: catMap.get(s.category_id) || 'Diğer',
    streamId: s.stream_id,
    containerExtension: s.container_extension || 'mp4'
  }))
}

export function getVodStreamUrl(cfg: XtreamSourceConfig, item: VodItem): string {
  const host = cleanHost(cfg.host)
  return `${host}/movie/${cfg.username}/${cfg.password}/${item.streamId}.${item.containerExtension}`
}

export async function getSeriesList(cfg: XtreamSourceConfig): Promise<SeriesItem[]> {
  const [catsRes, seriesRes] = await Promise.all([
    window.iptv.http.fetchJson<XtreamCategory[]>(apiUrl(cfg, 'get_series_categories')),
    window.iptv.http.fetchJson<XtreamSeries[]>(apiUrl(cfg, 'get_series'))
  ])

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

export async function getSeriesSeasons(
  cfg: XtreamSourceConfig,
  seriesId: number
): Promise<SeriesSeason[]> {
  const res = await window.iptv.http.fetchJson<XtreamSeriesInfo>(
    apiUrl(cfg, 'get_series_info', `&series_id=${seriesId}`)
  )
  const host = cleanHost(cfg.host)
  const episodesBySeason = res.data?.episodes || {}

  return Object.entries(episodesBySeason)
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
