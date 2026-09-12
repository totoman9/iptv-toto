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
}

export interface SeriesItem {
  id: string
  name: string
  logo?: string
  group: string
  seriesId: number
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
