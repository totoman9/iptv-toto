import { useEffect, useState } from 'react'

// Kalıcı, küçük uygulama verisi (izleme listesi, istatistik, takip…):
// açılışta bir kez okunur, değişince dinleyenlere haber verir ve diske yazar.
export interface PersistedStore<T> {
  init: () => Promise<void>
  get: () => T
  set: (next: T, saveDelayMs?: number) => void
  subscribe: (fn: (value: T) => void) => () => void
}

export function createPersisted<T>(key: string, initial: T): PersistedStore<T> {
  let value = initial
  const listeners = new Set<(value: T) => void>()
  let saveTimer: ReturnType<typeof setTimeout> | null = null

  return {
    async init() {
      try {
        value = (await window.iptv.store.read<T>(key)) ?? initial
      } catch {
        value = initial
      }
    },
    get: () => value,
    set(next, saveDelayMs = 0) {
      value = next
      for (const fn of listeners) fn(value)
      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = setTimeout(() => void window.iptv.store.write(key, value), saveDelayMs)
    },
    subscribe(fn) {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    }
  }
}

export function usePersisted<T>(store: PersistedStore<T>): T {
  const [value, setValue] = useState<T>(store.get)
  useEffect(() => store.subscribe(setValue), [store])
  return value
}
