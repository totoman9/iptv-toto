// Uygulama genelinde paylaşılan tipler (main, preload ve renderer arasında)

export type SourceType = 'm3u' | 'xtream'

export interface M3USourceConfig {
  type: 'm3u'
  id: string
  name: string
  url: string
}

export interface XtreamSourceConfig {
  type: 'xtream'
  id: string
  name: string
  host: string // örn: http://sunucu.com:8080
  username: string
  password: string
  // Hesabın canlı yayın için desteklediği format (bazı paneller yalnızca .ts
  // verir, .m3u8 vermez). Bilinmiyorsa 'm3u8' varsayılır.
  liveExtension?: 'm3u8' | 'ts'
}

export type SourceConfig = M3USourceConfig | XtreamSourceConfig

export interface Channel {
  id: string
  name: string
  logo?: string
  group: string
  url: string
  epgChannelId?: string
  // Xtream'e özgü, EPG/detay çağrıları için
  streamId?: number
}

export interface VodItem {
  id: string
  name: string
  logo?: string
  group: string
  streamId: number
  containerExtension: string
  rating?: number
  // Sağlayıcıya eklenme zamanı (unix sn) — "Son eklenenler" sırası için
  added?: number
}

export interface SeriesItem {
  id: string
  name: string
  logo?: string
  group: string
  seriesId: number
  rating?: number
  genre?: string
  year?: string
  backdrop?: string
}

export interface SeriesEpisode {
  id: string
  title: string
  season: number
  episodeNum: number
  url: string
}

export interface SeriesSeason {
  season: number
  episodes: SeriesEpisode[]
}

// Film/dizi detay bilgisi (Xtream get_vod_info / get_series_info'dan)
export interface MediaDetails {
  plot?: string
  cast?: string
  director?: string
  genre?: string
  releaseDate?: string
  rating?: string
  durationText?: string
  coverBig?: string
  backdrop?: string
}

// Oynatıcıya verilen öğe. kind/series* alanları "kaldığın yerden devam"
// kaydında hangi dizinin hangi bölümü olduğunu bilmek için tutulur.
export interface PlayableItem {
  id: string
  name: string
  group: string
  url: string
  streamId?: number
  isLive: boolean
  logo?: string
  kind?: 'live' | 'movie' | 'episode'
  seriesId?: number
  seriesName?: string
  season?: number
  episodeNum?: number
}

export interface EpgProgram {
  title: string
  description?: string
  start: number // unix ms
  end: number // unix ms
}

export interface HttpResult<T = string> {
  ok: boolean
  status?: number
  data?: T
  error?: string
}

export interface ClipResult {
  ok: boolean
  path?: string
  error?: string
}
