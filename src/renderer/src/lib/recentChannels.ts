import { createPersisted } from './persisted'

// Son izlenen canlı kanallar ("Son izlenenler" şeridi). Sadece kısayol —
// açılışta otomatik bağlanmaz, tek bağlantılı hesaplarda sorun çıkarmaz.

export interface RecentChannelEntry {
  id: string
  name: string
  logo?: string
  group: string
  watchedAt: number
}

const MAX_RECENT = 12

export const recentChannelsStore = createPersisted<RecentChannelEntry[]>('recent-channels', [])

export function recordRecentChannel(entry: Omit<RecentChannelEntry, 'watchedAt'>): void {
  const list = recentChannelsStore.get()
  const next = [{ ...entry, watchedAt: Date.now() }, ...list.filter((x) => x.id !== entry.id)].slice(
    0,
    MAX_RECENT
  )
  recentChannelsStore.set(next)
}
