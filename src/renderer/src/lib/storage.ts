// Kalıcı depolama yardımcıları (Electron main süreci üzerinden JSON dosyalarına yazar)
import type { SourceConfig } from '../../../shared/types'

const KEYS = {
  sources: 'sources',
  activeSourceId: 'active-source-id',
  favorites: 'favorites',
  favoriteFolders: 'favorite-folders',
  continueWatching: 'continue-watching',
  parentalPin: 'parental-pin',
  parentalLockedGroups: 'parental-locked-groups'
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

// "Spor", "Haber", "Çocuk" gibi kullanıcının oluşturduğu favori klasörleri
export interface FavoriteFolder {
  id: string
  name: string
  channelIds: string[]
}

export async function loadFavoriteFolders(): Promise<FavoriteFolder[]> {
  const data = await window.iptv.store.read<FavoriteFolder[]>(KEYS.favoriteFolders)
  return data || []
}

export async function saveFavoriteFolders(folders: FavoriteFolder[]): Promise<void> {
  await window.iptv.store.write(KEYS.favoriteFolders, folders)
}

export interface ContinueWatchingEntry {
  id: string
  title: string
  logo?: string
  positionSeconds: number
  durationSeconds: number
  updatedAt: number
  // Aşağıdakiler "İzlemeye devam et" satırından doğrudan oynatabilmek ve
  // dizilerde hangi bölümde kalındığını göstermek için
  kind?: 'movie' | 'episode'
  url?: string
  group?: string
  seriesId?: number
  seriesName?: string
  season?: number
  episodeNum?: number
}

export async function loadContinueWatching(): Promise<ContinueWatchingEntry[]> {
  const data = await window.iptv.store.read<ContinueWatchingEntry[]>(KEYS.continueWatching)
  return data || []
}

export async function saveContinueWatching(entries: ContinueWatchingEntry[]): Promise<void> {
  await window.iptv.store.write(KEYS.continueWatching, entries)
}

// ---------- Ebeveyn kilidi ----------

export async function loadParentalPin(): Promise<string | null> {
  return window.iptv.store.read<string>(KEYS.parentalPin)
}

export async function saveParentalPin(pin: string | null): Promise<void> {
  await window.iptv.store.write(KEYS.parentalPin, pin)
}

export async function loadLockedGroups(): Promise<string[]> {
  const data = await window.iptv.store.read<string[]>(KEYS.parentalLockedGroups)
  return data || []
}

export async function saveLockedGroups(groups: string[]): Promise<void> {
  await window.iptv.store.write(KEYS.parentalLockedGroups, groups)
}
