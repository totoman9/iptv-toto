// Altyazı görünümü: yazı boyutu, arka plan (şeffaflık) ve yazı rengi.
// CSS özel özellikleri (custom properties) üzerinden video::cue'ya uygulanır.

export type SubtitleSize = 'sm' | 'md' | 'lg'
export type SubtitleBackground = 'none' | 'soft' | 'solid'
export type SubtitleColor = 'white' | 'yellow'

export interface SubtitleAppearance {
  size: SubtitleSize
  background: SubtitleBackground
  color: SubtitleColor
}

export const DEFAULT_SUBTITLE_APPEARANCE: SubtitleAppearance = {
  size: 'md',
  background: 'soft',
  color: 'white'
}

const KEY = 'iptv-toto-subtitle-appearance'

export function loadSubtitleAppearance(): SubtitleAppearance {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return DEFAULT_SUBTITLE_APPEARANCE
    const parsed = JSON.parse(raw) as Partial<SubtitleAppearance>
    return { ...DEFAULT_SUBTITLE_APPEARANCE, ...parsed }
  } catch {
    return DEFAULT_SUBTITLE_APPEARANCE
  }
}

export function saveSubtitleAppearance(a: SubtitleAppearance): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(a))
  } catch {
    /* ignore */
  }
}

const SIZE_EM: Record<SubtitleSize, string> = { sm: '0.95em', md: '1.15em', lg: '1.4em' }
const BG_COLOR: Record<SubtitleBackground, string> = {
  none: 'transparent',
  soft: 'rgba(0, 0, 0, 0.5)',
  solid: 'rgba(0, 0, 0, 0.88)'
}
const TEXT_COLOR: Record<SubtitleColor, string> = { white: '#ffffff', yellow: '#ffd54a' }

// Verilen elemana (video sarmalayıcısı) CSS değişkenleri olarak uygular;
// video::cue bunları var() ile okuyor (bkz. styles/features.css).
export function applySubtitleAppearance(el: HTMLElement, a: SubtitleAppearance): void {
  el.style.setProperty('--sub-size', SIZE_EM[a.size])
  el.style.setProperty('--sub-bg', BG_COLOR[a.background])
  el.style.setProperty('--sub-color', TEXT_COLOR[a.color])
  // Şeffaf arka planda okunabilirlik için gölge belirginleşsin
  el.style.setProperty('--sub-shadow', a.background === 'none' ? '0 1px 3px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.9)' : '0 1px 2px rgba(0,0,0,0.6)')
}
