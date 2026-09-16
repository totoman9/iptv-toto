import type { PlayableItem, SeriesItem } from '../../../shared/types'
import { createPersisted } from './persisted'
import { fold } from './search'

// ---------- İzleme listesi ("Sonra izle") ----------

export interface WatchlistEntry {
  id: string
  kind: 'vod' | 'series'
  name: string
  logo?: string
  group: string
  addedAt: number
}

export const watchlistStore = createPersisted<WatchlistEntry[]>('watchlist', [])

// Aynı film/dizi farklı bir kaynaktan (ör. arama ile kütüphaneden) farklı bir
// kimlikle gelip iki kez eklenebiliyordu — id'nin yanı sıra aynı tür + aynı
// (sadeleştirilmiş) isimde bir kayıt var mı diye de bakıyoruz.
export function toggleWatchlist(entry: Omit<WatchlistEntry, 'addedAt'>): boolean {
  const list = watchlistStore.get()
  const name = fold(entry.name)
  const exists = list.some((x) => x.id === entry.id || (x.kind === entry.kind && fold(x.name) === name))
  watchlistStore.set(
    exists
      ? list.filter((x) => x.id !== entry.id && !(x.kind === entry.kind && fold(x.name) === name))
      : [{ ...entry, addedAt: Date.now() }, ...list]
  )
  return !exists
}

// ---------- Beğeniler (Netflix'teki başparmak yukarı gibi) ----------

export const likedStore = createPersisted<string[]>('liked-titles', [])

export function toggleLike(id: string): boolean {
  const list = likedStore.get()
  const exists = list.includes(id)
  likedStore.set(exists ? list.filter((x) => x !== id) : [id, ...list])
  return !exists
}

// ---------- Dizi takibi (yeni bölüm bildirimi) ----------

export interface FollowedSeries {
  seriesId: number
  name: string
  logo?: string
  group: string
  episodeCount: number
  newCount: number
  checkedAt: number
}

export const followStore = createPersisted<FollowedSeries[]>('followed-series', [])

export function toggleFollow(s: SeriesItem, episodeCount: number): boolean {
  const list = followStore.get()
  const exists = list.some((f) => f.seriesId === s.seriesId)
  followStore.set(
    exists
      ? list.filter((f) => f.seriesId !== s.seriesId)
      : [
          ...list,
          {
            seriesId: s.seriesId,
            name: s.name,
            logo: s.logo,
            group: s.group,
            episodeCount,
            newCount: 0,
            checkedAt: Date.now()
          }
        ]
  )
  return !exists
}

// Dizi sayfası açıldı: yeni bölümler görüldü sayılır
export function markSeriesSeen(seriesId: number, episodeCount: number): void {
  const list = followStore.get()
  const f = list.find((x) => x.seriesId === seriesId)
  if (!f || (f.newCount === 0 && f.episodeCount === episodeCount)) return
  followStore.set(
    list.map((x) => (x.seriesId === seriesId ? { ...x, episodeCount, newCount: 0, checkedAt: Date.now() } : x))
  )
}

// Arka plan kontrolünün sonucu; kaç yeni bölüm bulunduğunu döner
export function recordSeriesCheck(seriesId: number, episodeCount: number): number {
  const list = followStore.get()
  const f = list.find((x) => x.seriesId === seriesId)
  if (!f) return 0
  const added = Math.max(0, episodeCount - f.episodeCount)
  followStore.set(
    list.map((x) =>
      x.seriesId === seriesId
        ? { ...x, episodeCount: Math.max(x.episodeCount, episodeCount), newCount: x.newCount + added, checkedAt: Date.now() }
        : x
    )
  )
  return added
}

// ---------- İzleme istatistikleri ----------

export type WatchKind = 'live' | 'movie' | 'episode'

export interface WatchStats {
  days: Record<string, Partial<Record<WatchKind, number>>>
  items: Record<
    string,
    { name: string; kind: WatchKind; logo?: string; group: string; seconds: number; lastAt: number }
  >
}

export const statsStore = createPersisted<WatchStats>('watch-stats', { days: {}, items: {} })

const pad = (n: number): string => String(n).padStart(2, '0')
export const dayKey = (d = new Date()): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export function addWatchTime(item: PlayableItem, seconds: number): void {
  if (item.kind === 'recording') return
  const kind: WatchKind = item.isLive ? 'live' : item.kind === 'episode' ? 'episode' : 'movie'
  const s = statsStore.get()
  const day = dayKey()
  const today = { ...s.days[day] }
  today[kind] = (today[kind] || 0) + seconds
  // Dizilerde bölümler dizi adı altında toplanır
  const key = kind === 'episode' && item.seriesId !== undefined ? `series-${item.seriesId}` : item.id
  const prev = s.items[key]
  statsStore.set(
    {
      days: { ...s.days, [day]: today },
      items: {
        ...s.items,
        [key]: {
          name: kind === 'episode' ? item.seriesName || item.name : item.name,
          kind,
          logo: item.logo,
          group: item.group,
          seconds: (prev?.seconds || 0) + seconds,
          lastAt: Date.now()
        }
      }
    },
    10_000
  )
}

export function resetStats(): void {
  statsStore.set({ days: {}, items: {} })
}

// ---------- Son ziyaret ("son ziyaretinden beri eklenenler") ----------

const visitStore = createPersisted<{ vod?: number; series?: number }>('last-visit', {})
let previousVisit: { vod?: number; series?: number } = {}

export async function initLibraryStores(): Promise<void> {
  await Promise.all([watchlistStore.init(), followStore.init(), statsStore.init(), visitStore.init()])
  previousVisit = { ...visitStore.get() }
  // Bu açılış "son ziyaret" olarak az sonra kaydedilir
  setTimeout(() => visitStore.set({ vod: Date.now(), series: Date.now() }), 20_000)
}

export function getPreviousVisit(kind: 'vod' | 'series'): number | undefined {
  return previousVisit[kind]
}

// YouTube adresinden/kimliğinden video kimliği
export function youtubeId(value?: string): string | undefined {
  if (!value) return undefined
  const m = value.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/)
  if (m) return m[1]
  const v = value.trim()
  return /^[\w-]{11}$/.test(v) ? v : undefined
}
