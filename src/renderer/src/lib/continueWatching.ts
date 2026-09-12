// VOD/dizi izleme konumunu hatırlama. Her seferinde tüm listeyi IPC üzerinden
// okuyup yazmamak için bellekte küçük bir önbellek tutuyoruz.
import {
  loadContinueWatching,
  saveContinueWatching,
  type ContinueWatchingEntry
} from './storage'

let cache: ContinueWatchingEntry[] | null = null
let loadPromise: Promise<ContinueWatchingEntry[]> | null = null

function ensureLoaded(): Promise<ContinueWatchingEntry[]> {
  if (cache) return Promise.resolve(cache)
  if (!loadPromise) {
    loadPromise = loadContinueWatching().then((entries) => {
      cache = entries
      return entries
    })
  }
  return loadPromise
}

export async function getProgress(id: string): Promise<ContinueWatchingEntry | undefined> {
  const entries = await ensureLoaded()
  return entries.find((e) => e.id === id)
}

export function saveProgress(entry: ContinueWatchingEntry): void {
  ensureLoaded().then((entries) => {
    const idx = entries.findIndex((e) => e.id === entry.id)
    if (idx >= 0) entries[idx] = entry
    else entries.push(entry)
    // Liste sonsuza kadar büyümesin
    if (entries.length > 60) entries.splice(0, entries.length - 60)
    cache = entries
    saveContinueWatching(entries)
  })
}

export function clearProgress(id: string): void {
  ensureLoaded().then((entries) => {
    const next = entries.filter((e) => e.id !== id)
    cache = next
    saveContinueWatching(next)
  })
}
