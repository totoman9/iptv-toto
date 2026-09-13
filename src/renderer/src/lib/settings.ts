// Uygulama ayarları (şimdilik harici servis anahtarları). Açılışta bir kez
// yüklenir; bileşenler useSettings ile değişiklikleri izler.

export interface AppSettings {
  // IMDb puanları için OMDb anahtarı (omdbapi.com, ücretsiz)
  omdbKey?: string
}

const KEY = 'settings'

let current: AppSettings = {}
const listeners = new Set<(s: AppSettings) => void>()

export async function initSettings(): Promise<void> {
  try {
    current = (await window.iptv.store.read<AppSettings>(KEY)) || {}
  } catch {
    current = {}
  }
}

export function getSettings(): AppSettings {
  return current
}

export function updateSettings(patch: Partial<AppSettings>): void {
  current = { ...current, ...patch }
  void window.iptv.store.write(KEY, current)
  for (const fn of listeners) fn(current)
}

export function subscribeSettings(fn: (s: AppSettings) => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
