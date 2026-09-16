// Açık / koyu / tam siyah tema ve vurgu rengi. Seçim bu bilgisayarda
// hatırlanır; tema hiç seçilmediyse sistemin (macOS/Windows) görünüm ayarı
// kullanılır. "black": OLED ekranlarda pil tasarrufu sağlayan, tamamen
// siyah zemin (koyu temanın morumsu tonu yerine).
export type Theme = 'light' | 'dark' | 'black'

export type Accent = 'purple' | 'blue' | 'teal' | 'green' | 'orange' | 'pink' | 'red'

export const ACCENTS: { id: Accent; label: string; color: string }[] = [
  { id: 'purple', label: 'Mor', color: '#7c3aed' },
  { id: 'blue', label: 'Mavi', color: '#2563eb' },
  { id: 'teal', label: 'Turkuaz', color: '#0d9488' },
  { id: 'green', label: 'Yeşil', color: '#16a34a' },
  { id: 'orange', label: 'Turuncu', color: '#ea580c' },
  { id: 'pink', label: 'Pembe', color: '#db2777' },
  { id: 'red', label: 'Kırmızı', color: '#dc2626' }
]

// Film/dizi afişlerinin ızgara görünümündeki boyutu
export type PosterSize = 'sm' | 'md' | 'lg'

const THEME_KEY = 'iptv-toto-theme'
const ACCENT_KEY = 'iptv-toto-accent'
const POSTER_SIZE_KEY = 'iptv-toto-poster-size'

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

export function loadTheme(): Theme {
  const stored = read(THEME_KEY)
  if (stored === 'light' || stored === 'dark' || stored === 'black') return stored
  // Bir video uygulaması için koyu tema daha uygun — sistem açık modda olsa
  // bile ilk açılış koyu başlar (Ayarlar'dan istendiğinde değiştirilebilir).
  return 'dark'
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  // Sistemde "black" diye bir renk şeması yok; tarayıcıya koyu olduğunu
  // söylüyoruz ki form/kaydırma çubuğu gibi yerel öğeler de koyu görünsün.
  document.documentElement.style.colorScheme = theme === 'light' ? 'light' : 'dark'
}

export function saveTheme(theme: Theme): void {
  write(THEME_KEY, theme)
}

export function loadAccent(): Accent {
  const stored = read(ACCENT_KEY)
  return ACCENTS.some((a) => a.id === stored) ? (stored as Accent) : 'purple'
}

export function applyAccent(accent: Accent): void {
  document.documentElement.dataset.accent = accent
}

export function saveAccent(accent: Accent): void {
  write(ACCENT_KEY, accent)
}

export function loadPosterSize(): PosterSize {
  const stored = read(POSTER_SIZE_KEY)
  return stored === 'sm' || stored === 'lg' ? stored : 'md'
}

export function applyPosterSize(size: PosterSize): void {
  document.documentElement.dataset.posterSize = size
}

export function savePosterSize(size: PosterSize): void {
  write(POSTER_SIZE_KEY, size)
}

// Film/dizi kartlarının şekli: Netflix'teki gibi yatay (varsayılan) ya da
// klasik dikey afiş
export type PosterShape = 'landscape' | 'portrait'

const POSTER_SHAPE_KEY = 'iptv-toto-poster-shape'

export function loadPosterShape(): PosterShape {
  return read(POSTER_SHAPE_KEY) === 'portrait' ? 'portrait' : 'landscape'
}

export function savePosterShape(shape: PosterShape): void {
  write(POSTER_SHAPE_KEY, shape)
}

// Kart genişliği (px) — sanal listelerin satır yüksekliğini hesaplamak için
// CSS'teki --poster-width / --land-width değerleriyle aynı tutulmalı
export function cardWidth(size: PosterSize, shape: PosterShape): number {
  if (shape === 'landscape') return size === 'sm' ? 220 : size === 'lg' ? 340 : 280
  return size === 'sm' ? 118 : size === 'lg' ? 190 : 150
}

// Kartın toplam yüksekliği (görsel + altındaki başlık alanı)
export function cardHeight(size: PosterSize, shape: PosterShape): number {
  const w = cardWidth(size, shape)
  return shape === 'landscape' ? Math.round((w * 9) / 16) : Math.round(w * 1.5) + 48
}
