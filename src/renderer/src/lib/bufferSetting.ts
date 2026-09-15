// Canlı yayın tamponu (akıcılık) ayarı. Tampon büyüdükçe sunucudaki kısa
// takılmalar görüntüye yansımaz; karşılığında kanal birkaç saniye geç açılır
// ve yayın canlının biraz daha gerisinden izlenir. Otomatik modda 4K
// (UHD) kanallarda büyük, diğerlerinde normal tampon kullanılır.

export type BufferMode = 'auto' | 'normal' | 'high' | 'max'

const KEY = 'iptv-toto-buffer'

function load(): BufferMode {
  try {
    const v = window.localStorage.getItem(KEY)
    if (v === 'auto' || v === 'normal' || v === 'high' || v === 'max') return v
  } catch {
    /* ignore */
  }
  return 'auto'
}

let mode: BufferMode = load()

export function getBufferMode(): BufferMode {
  return mode
}

export function setBufferMode(next: BufferMode): void {
  mode = next
  try {
    window.localStorage.setItem(KEY, next)
  } catch {
    /* ignore */
  }
}

// Kanal adında UHD/4K geçiyorsa (bazı sağlayıcılar 4K etiketli kanalı daha
// düşük çözünürlükte veriyor ama bu kanallar yine de daha sık takılıyor)
let largeHint = false

export function setLargeBufferHint(on: boolean): void {
  largeHint = on
}

export function looksUhd(name: string): boolean {
  return /(u|ᴜ)(h|ʜ)(d|ᴅ)|4k|2160/i.test(name)
}

const isUhd = (video: HTMLVideoElement): boolean => largeHint || video.videoHeight > 1200

// Oynatma sırasında elde tutulmaya çalışılan yedek (sn)
export function bufferTargetSec(video: HTMLVideoElement): number {
  switch (mode) {
    case 'normal':
      return 4
    case 'high':
      return 10
    case 'max':
      return 20
    default:
      return isUhd(video) ? 12 : 4
  }
}

// Kanal açılırken oynatmaya başlamadan önce biriktirilecek yedek (sn).
// Sıfır bekleme, ses ile görüntünün henüz düzgün oturmadan ekrana
// düşmesine (biri diğerini "yakalıyormuş" gibi görünmesine) yol açıyordu;
// bu yüzden en hızlı modlarda bile en az 1,5 sn'lik küçük bir pay bırakılıyor.
export function startBufferSec(video: HTMLVideoElement): number {
  switch (mode) {
    case 'normal':
      return 1.5
    case 'high':
      return 5
    case 'max':
      return 10
    default:
      // Otomatik: çözünürlük belli olana kadar bekle, 4K ise biriktir
      if (largeHint) return 5
      return video.readyState < 1 ? Infinity : isUhd(video) ? 5 : 1.5
  }
}
