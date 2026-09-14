// Uygulama ayarları (şimdilik harici servis anahtarları). Açılışta bir kez
// yüklenir; bileşenler useSettings ile değişiklikleri izler.

export interface AppSettings {
  // Kullanıcının kendi OMDb anahtarı (boşsa uygulamayla gelen anahtar kullanılır)
  omdbKey?: string
}

// Uygulamayla birlikte gelen OMDb anahtarı: IMDb puanları kurulumdan hemen
// sonra, hiçbir şey girmeden çalışsın. (Ücretsiz anahtar: günde 1.000 istek,
// bu uygulamayı kullanan herkes arasında paylaşılır.)
export const BUILT_IN_OMDB_KEY = '26e017de'

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

// Kullanılacak OMDb anahtarı: kullanıcınınki varsa o, yoksa uygulamanınki
export function effectiveOmdbKey(settings: AppSettings = current): string {
  return settings.omdbKey || BUILT_IN_OMDB_KEY
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
