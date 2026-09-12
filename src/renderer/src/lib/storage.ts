// Kalıcı depolama yardımcıları (Electron main süreci üzerinden JSON dosyalarına yazar)
import type { SourceConfig } from '../../../shared/types'

const KEYS = {
  sources: 'sources',
  activeSourceId: 'active-source-id',
  favorites: 'favorites',
  continueWatching: 'continue-watching'
} as const

export async function loadSources(): Promise<SourceConfig[]> {
  const data = await window.iptv.store.read<SourceConfig[]>(KEYS.sources)
  return data || []
}

export async function saveSources(sources: SourceConfig[]): Promise<void> {
  await window.iptv.store.write(KEYS.sources, sources)
}

export async function loadActiveSourceId(): Promise<string | null> {
  return window.iptv.store.read<string>(KEYS.activeSourceId)
}

export async function saveActiveSourceId(id: string): Promise<void> {
  await window.iptv.store.write(KEYS.activeSourceId, id)
}

export interface FavoriteEntry {
  channelId: string
  addedAt: number
}

export async function loadFavorites(): Promise<FavoriteEntry[]> {
  const data = await window.iptv.store.read<FavoriteEntry[]>(KEYS.favorites)
  return data || []
}

export async function saveFavorites(favorites: FavoriteEntry[]): Promise<void> {
  await window.iptv.store.write(KEYS.favorites, favorites)
}

export interface ContinueWatchingEntry {
  id: string
  title: string
  logo?: string
  positionSeconds: number
  durationSeconds: number
  updatedAt: number
}

export async function loadContinueWatching(): Promise<ContinueWatchingEntry[]> {
  const data = await window.iptv.store.read<ContinueWatchingEntry[]>(KEYS.continueWatching)
  return data || []
}

export async function saveContinueWatching(entries: ContinueWatchingEntry[]): Promise<void> {
  await window.iptv.store.write(KEYS.continueWatching, entries)
}
