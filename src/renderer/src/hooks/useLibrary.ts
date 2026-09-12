import { useEffect, useState } from 'react'
import type { Channel, SeriesItem, SourceConfig, VodItem } from '../../../shared/types'
import { parseM3U } from '../lib/m3u'
import { getLiveChannels, getSeriesList, getVodItems } from '../lib/xtream'

export interface Library {
  channels: Channel[]
  vod: VodItem[]
  series: SeriesItem[]
  // Kategorilerin sağlayıcıdan geldiği sıra (TR kategoriler genelde en
  // başta gelir). Boşsa alfabetik sıralamaya düşülür.
  liveCategoryOrder: string[]
  vodCategoryOrder: string[]
  loading: boolean
  error: string | null
  reload: () => void
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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState(0)

  useEffect(() => {
    if (!source) {
      setChannels([])
      setVod([])
      setSeries([])
      setLiveCategoryOrder([])
      setVodCategoryOrder([])
      return
    }

    let cancelled = false
    setError(null)
    setChannels([])
    setVod([])
    setSeries([])
    setLoading(true)

    async function load(): Promise<void> {
      if (source!.type === 'm3u') {
        try {
          const res = await window.iptv.http.fetchText(source!.url, { timeoutMs: 30000 })
          if (!res.ok || !res.data) throw new Error(res.error || 'Liste indirilemedi')
          const parsed = parseM3U(res.data)
          if (!cancelled) {
            setChannels(parsed)
            setLiveCategoryOrder(firstSeenGroupOrder(parsed))
          }
        } catch (err) {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : 'Liste indirilemedi')
          }
        } finally {
          if (!cancelled) setLoading(false)
        }
        return
      }

      // Xtream panelleri genelde binlerce kanal/film/dizi döndürür ve aynı anda
      // birden fazla isteği kaldıramayabilir (bazı hesaplar tek bağlantıya
      // sınırlı). Bu yüzden canlı/film/dizi listelerini sırayla çekiyoruz;
      // canlı liste gelir gelmez ekranda görünür, film ve dizi arka planda
      // yüklenmeye devam eder.
      try {
        const live = await getLiveChannels(source!)
        if (cancelled) return
        setChannels(live.channels)
        setLiveCategoryOrder(live.categoryOrder)
        setLoading(false)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Canlı kanallar yüklenemedi')
          setLoading(false)
        }
        return
      }

      try {
        const vodResult = await getVodItems(source!)
        if (!cancelled) {
          setVod(vodResult.items)
          setVodCategoryOrder(vodResult.categoryOrder)
        }
      } catch {
        // Film listesi alınamadıysa sessizce boş bırak, canlı yayın etkilenmesin
      }

      try {
        const seriesItems = await getSeriesList(source!)
        if (!cancelled) setSeries(seriesItems)
      } catch {
        // Dizi listesi alınamadıysa sessizce boş bırak
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [source, reloadTick])

  return {
    channels,
    vod,
    series,
    liveCategoryOrder,
    vodCategoryOrder,
    loading,
    error,
    reload: () => setReloadTick((t) => t + 1)
  }
}
