import { useCallback, useEffect, useRef, useState } from 'react'
import type { Channel, SeriesItem, SourceConfig, VodItem } from '../../../shared/types'
import { parseM3U } from '../lib/m3u'
import { getLiveChannels, getSeriesList, getVodItems } from '../lib/xtream'

export type SectionStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface Library {
  channels: Channel[]
  vod: VodItem[]
  series: SeriesItem[]
  // Kategorilerin sağlayıcıdan geldiği sıra (TR kategoriler genelde en
  // başta gelir). Boşsa alfabetik sıralamaya düşülür.
  liveCategoryOrder: string[]
  vodCategoryOrder: string[]
  seriesCategoryOrder: string[]
  liveStatus: SectionStatus
  vodStatus: SectionStatus
  seriesStatus: SectionStatus
  // Önbellekten açıldıktan sonra arka planda sunucudan tazeleniyor mu
  refreshing: boolean
  // Arka plan tazelemesi sunucuya ulaşamadı (kayıtlı liste gösteriliyor)
  refreshFailed: boolean
  loading: boolean
  error: string | null
  reload: () => void
}

interface LibraryCache {
  version: 2
  savedAt: number
  channels: Channel[]
  vod: VodItem[]
  series: SeriesItem[]
  liveCategoryOrder: string[]
  vodCategoryOrder: string[]
  seriesCategoryOrder: string[]
}

// Önbellek bu kadar eskiyse açılışta arka planda sessizce tazelenir.
// Daha yeniyse sunucuya hiç gidilmez (yenile düğmesi her zaman tazeler).
const REFRESH_AFTER_MS = 6 * 60 * 60 * 1000

function cacheKey(source: SourceConfig): string {
  return `library-${source.id}`
}

// M3U listelerinde ayrı bir kategori API'si yok; grupları listede ilk
// göründükleri sırayla çıkarıyoruz (o da genelde listeyi hazırlayanın
// bilinçli sıralamasını yansıtır).
function firstSeenGroupOrder(items: { group: string }[]): string[] {
  const seen = new Set<string>()
  const order: string[] = []
  for (const item of items) {
    if (!seen.has(item.group)) {
      seen.add(item.group)
      order.push(item.group)
    }
  }
  return order
}

export function useLibrary(source: SourceConfig | null): Library {
  const [channels, setChannels] = useState<Channel[]>([])
  const [vod, setVod] = useState<VodItem[]>([])
  const [series, setSeries] = useState<SeriesItem[]>([])
  const [liveCategoryOrder, setLiveCategoryOrder] = useState<string[]>([])
  const [vodCategoryOrder, setVodCategoryOrder] = useState<string[]>([])
  const [seriesCategoryOrder, setSeriesCategoryOrder] = useState<string[]>([])
  const [liveStatus, setLiveStatus] = useState<SectionStatus>('idle')
  const [vodStatus, setVodStatus] = useState<SectionStatus>('idle')
  const [seriesStatus, setSeriesStatus] = useState<SectionStatus>('idle')
  const [refreshing, setRefreshing] = useState(false)
  const [refreshFailed, setRefreshFailed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState(0)
  const forceRefresh = useRef(false)

  useEffect(() => {
    if (!source) {
      setChannels([])
      setVod([])
      setSeries([])
      setLiveCategoryOrder([])
      setVodCategoryOrder([])
      setSeriesCategoryOrder([])
      setLiveStatus('idle')
      setVodStatus('idle')
      setSeriesStatus('idle')
      return
    }

    let cancelled = false
    const src = source
    const forced = forceRefresh.current
    forceRefresh.current = false
    setError(null)

    // Sunucu yanıt vermezse elde olan (önbellekteki) liste KORUNUR; eskiden
    // boş yanıt kayıtlı listenin üzerine yazılıp kanallar kayboluyordu.
    async function fetchFresh(cached: LibraryCache | null): Promise<void> {
      const hadCache = !!cached
      if (!hadCache) {
        setLiveStatus('loading')
        setVodStatus('loading')
        setSeriesStatus('loading')
      }
      setRefreshing(true)
      setRefreshFailed(false)

      const next: LibraryCache = cached
        ? { ...cached, savedAt: Date.now() }
        : {
            version: 2,
            savedAt: Date.now(),
            channels: [],
            vod: [],
            series: [],
            liveCategoryOrder: [],
            vodCategoryOrder: [],
            seriesCategoryOrder: []
          }

      try {
        if (src.type === 'm3u') {
          const res = await window.iptv.http.fetchText(src.url, { timeoutMs: 30000 })
          if (!res.ok || !res.data) throw new Error(res.error || 'Liste indirilemedi')
          next.channels = parseM3U(res.data)
          next.liveCategoryOrder = firstSeenGroupOrder(next.channels)
          if (cancelled) return
          setChannels(next.channels)
          setLiveCategoryOrder(next.liveCategoryOrder)
          setLiveStatus('ready')
          setVodStatus('ready')
          setSeriesStatus('ready')
        } else {
          // Xtream panelleri binlerce kanal/film/dizi döndürür ve aynı anda
          // birden fazla isteği kaldıramayabilir; listeleri sırayla çekiyoruz.
          const live = await getLiveChannels(src)
          if (cancelled) return
          next.channels = live.channels
          next.liveCategoryOrder = live.categoryOrder
          setChannels(live.channels)
          setLiveCategoryOrder(live.categoryOrder)
          setLiveStatus('ready')

          try {
            const s = await getSeriesList(src)
            if (cancelled) return
            next.series = s.items
            next.seriesCategoryOrder = s.categoryOrder
            setSeries(s.items)
            setSeriesCategoryOrder(s.categoryOrder)
            setSeriesStatus('ready')
          } catch {
            if (!cancelled && !hadCache) setSeriesStatus('error')
          }

          try {
            const v = await getVodItems(src)
            if (cancelled) return
            next.vod = v.items
            next.vodCategoryOrder = v.categoryOrder
            setVod(v.items)
            setVodCategoryOrder(v.categoryOrder)
            setVodStatus('ready')
          } catch {
            if (!cancelled && !hadCache) setVodStatus('error')
          }
        }

        if (!cancelled && next.channels.length > 0) {
          window.iptv.cache.write(cacheKey(src), next)
        }
      } catch (err) {
        if (!cancelled && !hadCache) {
          setError(err instanceof Error ? err.message : 'İçerik yüklenemedi')
          setLiveStatus('error')
        }
        if (!cancelled && hadCache) setRefreshFailed(true)
      } finally {
        if (!cancelled) setRefreshing(false)
      }
    }

    async function load(): Promise<void> {
      const cached = await window.iptv.cache.read<LibraryCache>(cacheKey(src))
      if (cancelled) return
      const usable = cached && cached.version === 2 && cached.channels?.length > 0
      if (usable) {
        setChannels(cached.channels)
        setVod(cached.vod || [])
        setSeries(cached.series || [])
        setLiveCategoryOrder(cached.liveCategoryOrder || [])
        setVodCategoryOrder(cached.vodCategoryOrder || [])
        setSeriesCategoryOrder(cached.seriesCategoryOrder || [])
        setLiveStatus('ready')
        setVodStatus('ready')
        setSeriesStatus('ready')
      } else {
        setChannels([])
        setVod([])
        setSeries([])
      }
      const stale = !usable || Date.now() - cached.savedAt > REFRESH_AFTER_MS
      if (forced || stale) await fetchFresh(usable ? cached : null)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [source, reloadTick])

  const reload = useCallback(() => {
    forceRefresh.current = true
    setReloadTick((t) => t + 1)
  }, [])

  // Sunucuya ulaşılamadıysa kendiliğinden tekrar dene (sunucuyu yormadan):
  // liste hiç yoksa 30 sn, kayıtlı liste gösteriliyorsa 2 dk sonra.
  useEffect(() => {
    if (!error && !refreshFailed) return
    const t = setTimeout(reload, error ? 30_000 : 120_000)
    return () => clearTimeout(t)
  }, [error, refreshFailed, reload])

  return {
    channels,
    vod,
    series,
    liveCategoryOrder,
    vodCategoryOrder,
    seriesCategoryOrder,
    liveStatus,
    vodStatus,
    seriesStatus,
    refreshing,
    refreshFailed,
    loading: liveStatus === 'loading',
    error,
    reload
  }
}
