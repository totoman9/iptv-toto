import { useEffect, useState } from 'react'
import type { Channel, SeriesItem, SourceConfig, VodItem } from '../../../shared/types'
import { parseM3U } from '../lib/m3u'
import { getLiveChannels, getSeriesList, getVodItems } from '../lib/xtream'

export interface Library {
  channels: Channel[]
  vod: VodItem[]
  series: SeriesItem[]
  loading: boolean
  error: string | null
  reload: () => void
}

export function useLibrary(source: SourceConfig | null): Library {
  const [channels, setChannels] = useState<Channel[]>([])
  const [vod, setVod] = useState<VodItem[]>([])
  const [series, setSeries] = useState<SeriesItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState(0)

  useEffect(() => {
    if (!source) {
      setChannels([])
      setVod([])
      setSeries([])
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    async function load(): Promise<void> {
      try {
        if (source!.type === 'm3u') {
          const res = await window.iptv.http.fetchText(source!.url, { timeoutMs: 30000 })
          if (!res.ok || !res.data) throw new Error(res.error || 'Liste indirilemedi')
          const parsed = parseM3U(res.data)
          if (!cancelled) {
            setChannels(parsed)
            setVod([])
            setSeries([])
          }
        } else {
          const [liveRes, vodRes, seriesRes] = await Promise.allSettled([
            getLiveChannels(source!),
            getVodItems(source!),
            getSeriesList(source!)
          ])
          if (!cancelled) {
            setChannels(liveRes.status === 'fulfilled' ? liveRes.value : [])
            setVod(vodRes.status === 'fulfilled' ? vodRes.value : [])
            setSeries(seriesRes.status === 'fulfilled' ? seriesRes.value : [])
            if (liveRes.status === 'rejected') {
              throw liveRes.reason
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'İçerik yüklenirken bir hata oluştu')
        }
      } finally {
        if (!cancelled) setLoading(false)
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
    loading,
    error,
    reload: () => setReloadTick((t) => t + 1)
  }
}
