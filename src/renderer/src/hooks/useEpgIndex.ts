import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Channel, SourceConfig } from '../../../shared/types'
import {
  buildEpgIndex,
  EPG_INDEX_REFRESH_MS,
  pickIndexChannels,
  type EpgIndexCache,
  type IndexedChannel
} from '../lib/epgIndex'

export interface EpgIndexState {
  channels: IndexedChannel[]
  savedAt: number | null
  building: boolean
  progress: { done: number; total: number } | null
  // Sunucu rehber isteklerine hata verdiyse açıklama
  error: string | null
  refresh: () => void
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export function useEpgIndex(
  source: SourceConfig | null,
  channels: Channel[],
  order: string[],
  favoriteIds: Set<string>
): EpgIndexState {
  const [indexed, setIndexed] = useState<IndexedChannel[]>([])
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [building, setBuilding] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const forced = useRef(false)

  const selection = useMemo(
    () => (source?.type === 'xtream' ? pickIndexChannels(channels, order, favoriteIds) : []),
    [source, channels, order, favoriteIds]
  )
  const selectionKey = selection.map((c) => c.id).join(',')

  useEffect(() => {
    if (!source || source.type !== 'xtream' || selection.length === 0) {
      setIndexed([])
      setSavedAt(null)
      return
    }
    let cancelled = false
    const cfg = source
    const cacheKey = `epg-index-${cfg.id}`
    const wanted = new Set(selection.map((c) => c.id))

    ;(async () => {
      const cached = await window.iptv.cache.read<EpgIndexCache>(cacheKey)
      if (cancelled) return
      const usable = cached?.version === 1
      if (usable) {
        setIndexed(cached.channels.filter((c) => wanted.has(c.channelId)))
        setSavedAt(cached.savedAt)
      }
      const fresh = usable && Date.now() - cached.savedAt < EPG_INDEX_REFRESH_MS && !forced.current
      forced.current = false

      // Önbellek tazeyse yalnızca yeni eklenen (ör. yeni favori) kanalları sor
      const known = new Set([...(cached?.channels.map((c) => c.channelId) || []), ...(cached?.emptyIds || [])])
      const toFetch = fresh ? selection.filter((c) => !known.has(c.id)) : selection
      if (toFetch.length === 0) return

      setBuilding(true)
      // Açılışta içerik listesi yüklenirken sunucuyu yormamak için biraz bekle
      if (!usable) await sleep(4000)
      if (cancelled) return
      const result = await buildEpgIndex(
        cfg,
        toFetch,
        (partial, done, total) => {
          if (cancelled) return
          setProgress({ done, total })
          if (!usable) setIndexed(partial)
        },
        () => cancelled
      )
      if (cancelled || !result) return

      // Sunucu hata verdiyse: elimizdekini göster, önbelleği "taze" diye
      // işaretleme; bir sonraki denemeyi normal tazeleme zamanına bırak
      if (result.blocked) {
        const partial = fresh ? [...(cached?.channels || []), ...result.channels] : result.channels
        if (partial.length > 0) setIndexed(partial.filter((c) => wanted.has(c.channelId)))
        setBuilding(false)
        setProgress(null)
        setError('Sağlayıcı şu an rehber isteklerine yanıt vermiyor; daha sonra tekrar denenecek.')
        return
      }
      setError(null)

      const merged = fresh
        ? [...(cached?.channels || []), ...result.channels]
        : result.channels
      const emptyIds = fresh ? [...(cached?.emptyIds || []), ...result.emptyIds] : result.emptyIds
      const stamp = fresh && cached ? cached.savedAt : Date.now()
      setIndexed(merged.filter((c) => wanted.has(c.channelId)))
      setSavedAt(stamp)
      setBuilding(false)
      setProgress(null)
      const next: EpgIndexCache = { version: 1, savedAt: stamp, channels: merged, emptyIds }
      void window.iptv.cache.write(cacheKey, next)
    })()

    return () => {
      cancelled = true
      setBuilding(false)
      setProgress(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, selectionKey, tick])

  const refresh = useCallback(() => {
    forced.current = true
    setTick((t) => t + 1)
  }, [])

  return { channels: indexed, savedAt, building, progress, error, refresh }
}
