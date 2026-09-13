// Açık / koyu tema. Seçim bu bilgisayarda hatırlanır; hiç seçilmediyse
// sistemin (macOS/Windows) görünüm ayarı kullanılır.
export type Theme = 'light' | 'dark'

const THEME_KEY = 'iptv-toto-theme'

export function loadTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(THEME_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    /* ignore */
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
}

export function saveTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_KEY, theme)
  } catch {
    /* ignore */
  }
}
