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

const THEME_KEY = 'iptv-toto-theme'
const ACCENT_KEY = 'iptv-toto-accent'

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
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
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
