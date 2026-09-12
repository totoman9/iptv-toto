// VOD/dizi izleme konumunu hatırlama. Her seferinde tüm listeyi IPC üzerinden
// okuyup yazmamak için bellekte küçük bir önbellek tutuyoruz. Değişince
// abonelere haber verilir (Netflix ekranındaki "İzlemeye devam et" satırı ve
// ilerleme çubukları anında güncellensin diye).
import {
  loadContinueWatching,
  saveContinueWatching,
  type ContinueWatchingEntry
} from './storage'

let cache: ContinueWatchingEntry[] | null = null
let loadPromise: Promise<ContinueWatchingEntry[]> | null = null
const listeners = new Set<(entries: ContinueWatchingEntry[]) => void>()

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

function notify(): void {
  if (!cache) return
  const snapshot = [...cache]
  listeners.forEach((l) => l(snapshot))
}

export async function getProgress(id: string): Promise<ContinueWatchingEntry | undefined> {
  const entries = await ensureLoaded()
  return entries.find((e) => e.id === id)
}

export async function getAllProgress(): Promise<ContinueWatchingEntry[]> {
  return [...(await ensureLoaded())]
}

export function subscribeProgress(listener: (entries: ContinueWatchingEntry[]) => void): () => void {
  listeners.add(listener)
  ensureLoaded().then((entries) => listener([...entries]))
  return () => {
    listeners.delete(listener)
  }
}

export function saveProgress(entry: ContinueWatchingEntry): void {
  ensureLoaded().then((entries) => {
    const idx = entries.findIndex((e) => e.id === entry.id)
    if (idx >= 0) entries[idx] = { ...entries[idx], ...entry }
    else entries.push(entry)
    // Liste sonsuza kadar büyümesin
    if (entries.length > 200) {
      entries.sort((a, b) => a.updatedAt - b.updatedAt)
      entries.splice(0, entries.length - 200)
    }
    cache = entries
    saveContinueWatching(entries)
    notify()
  })
}

export function clearProgress(id: string): void {
  ensureLoaded().then((entries) => {
    cache = entries.filter((e) => e.id !== id)
    saveContinueWatching(cache)
    notify()
  })
}

export function isFinished(e: Pick<ContinueWatchingEntry, 'positionSeconds' | 'durationSeconds'>): boolean {
  return e.durationSeconds > 0 && e.positionSeconds >= e.durationSeconds * 0.93
}

export function progressRatio(
  e: Pick<ContinueWatchingEntry, 'positionSeconds' | 'durationSeconds'> | undefined
): number {
  if (!e || !e.durationSeconds) return 0
  return Math.min(1, Math.max(0, e.positionSeconds / e.durationSeconds))
}
