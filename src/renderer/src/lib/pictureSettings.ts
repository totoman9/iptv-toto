// Oynatıcı görüntü ayarları (parlaklık, kontrast, renk…) ve kayıtlı
// profiller. Ayarlar videoya CSS filtresi olarak uygulanır; yayının kendisi
// değişmez, yalnızca ekrandaki görüntü.

export type PictureFit = 'contain' | 'cover' | 'fill'

export interface PictureSettings {
  brightness: number // %
  contrast: number // %
  saturation: number // %
  warmth: number // 0-40 (sıcak ton)
  hue: number // derece
  fit: PictureFit
}

export interface PictureProfile {
  id: string
  name: string
  settings: PictureSettings
  builtIn?: boolean
}

export const DEFAULT_PICTURE: PictureSettings = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  warmth: 0,
  hue: 0,
  fit: 'contain'
}

export const BUILT_IN_PROFILES: PictureProfile[] = [
  { id: 'standard', name: 'Standart', builtIn: true, settings: DEFAULT_PICTURE },
  {
    id: 'film',
    name: 'Film',
    builtIn: true,
    settings: { ...DEFAULT_PICTURE, brightness: 96, contrast: 108, saturation: 94, warmth: 12 }
  },
  {
    id: 'dizi',
    name: 'Dizi',
    builtIn: true,
    settings: { ...DEFAULT_PICTURE, brightness: 101, contrast: 104, saturation: 104, warmth: 6 }
  },
  {
    id: 'spor',
    name: 'Spor',
    builtIn: true,
    settings: { ...DEFAULT_PICTURE, brightness: 104, contrast: 110, saturation: 124 }
  },
  {
    id: 'oyun',
    name: 'Oyun',
    builtIn: true,
    settings: { ...DEFAULT_PICTURE, brightness: 103, contrast: 116, saturation: 132 }
  }
]

export interface StoredPicture {
  activeId: string | null
  current: PictureSettings
  custom: PictureProfile[]
}

const KEY = 'iptv-toto-picture'

export function loadPicture(): StoredPicture {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as StoredPicture
      return {
        activeId: parsed.activeId ?? 'standard',
        current: { ...DEFAULT_PICTURE, ...parsed.current },
        custom: Array.isArray(parsed.custom) ? parsed.custom : []
      }
    }
  } catch {
    /* ignore */
  }
  return { activeId: 'standard', current: DEFAULT_PICTURE, custom: [] }
}

export function savePicture(value: StoredPicture): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(value))
  } catch {
    /* ignore */
  }
}

export function pictureFilter(s: PictureSettings): string {
  if (
    s.brightness === 100 &&
    s.contrast === 100 &&
    s.saturation === 100 &&
    s.warmth === 0 &&
    s.hue === 0
  ) {
    return 'none'
  }
  return [
    `brightness(${s.brightness / 100})`,
    `contrast(${s.contrast / 100})`,
    `saturate(${s.saturation / 100})`,
    s.warmth ? `sepia(${s.warmth / 100})` : '',
    s.hue ? `hue-rotate(${s.hue}deg)` : ''
  ]
    .filter(Boolean)
    .join(' ')
}
