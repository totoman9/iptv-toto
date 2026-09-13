import { useEffect, useRef } from 'react'
import type { SourceConfig } from '../../../shared/types'
import { getSeriesSeasons } from '../lib/xtream'
import { followStore, recordSeriesCheck, type FollowedSeries } from '../lib/library'

const CHECK_EVERY_MS = 6 * 3600_000
const GAP_MS = 3000
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

// Takip edilen dizilere yeni bölüm eklendi mi? Açılıştan 1,5 dk sonra ve
// 6 saatte bir, dizi dizi (aralarında bekleyerek, sunucuyu yormadan) bakar.
export function useFollowChecker(
  source: SourceConfig | null,
  onNewEpisodes: (series: FollowedSeries, added: number) => void
): void {
  const callback = useRef(onNewEpisodes)
  callback.current = onNewEpisodes

  useEffect(() => {
    if (!source || source.type !== 'xtream') return
    const cfg = source
    let cancelled = false

    const run = async (): Promise<void> => {
      const due = followStore
        .get()
        .filter((f) => Date.now() - f.checkedAt > CHECK_EVERY_MS)
        .slice(0, 40)
      for (const f of due) {
        if (cancelled) return
        try {
          const { seasons } = await getSeriesSeasons(cfg, f.seriesId)
          const count = seasons.reduce((n, s) => n + s.episodes.length, 0)
          // Sunucu yanıt vermediyse (0 bölüm) yanlış "yeni bölüm" üretme
          if (count > 0) {
            const added = recordSeriesCheck(f.seriesId, count)
            if (added > 0) callback.current(f, added)
          }
        } catch {
          /* bir sonraki kontrolde tekrar denenir */
        }
        await sleep(GAP_MS)
      }
    }

    const first = setTimeout(() => void run(), 90_000)
    const iv = setInterval(() => void run(), CHECK_EVERY_MS)
    return () => {
      cancelled = true
      clearTimeout(first)
      clearInterval(iv)
    }
  }, [source])
}
