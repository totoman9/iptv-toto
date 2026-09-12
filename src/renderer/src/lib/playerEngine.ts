import Hls from 'hls.js'
import mpegts from 'mpegts.js'

export type EngineKind = 'hls' | 'mpegts' | 'native'

export interface StreamInfo {
  bitrateKbps?: number
  videoCodec?: string
  audioCodec?: string
  // Yayının kendi bildirdiği (nominal) kare hızı — pencere odakta değilken
  // tarayıcının kısabileceği gerçek render hızından daha güvenilirdir.
  nominalFps?: number
}

export interface AttachedPlayer {
  kind: EngineKind
  getInfo: () => StreamInfo
  destroy: () => void
}

function detectKind(url: string): EngineKind {
  const clean = url.split('?')[0].toLowerCase()
  if (clean.endsWith('.m3u8')) return 'hls'
  if (clean.endsWith('.ts')) return 'mpegts'
  return 'native'
}

// Bazı Xtream hesapları yalnızca .ts çıktısına izin verir, bazıları yalnızca
// .m3u8. Hangisi olduğunu önceden bilemeyebiliriz; biri başarısız olursa
// diğerini otomatik dener.
function alternateUrl(url: string, kind: EngineKind): string | null {
  const [base, query] = url.split(/(?=[?])/) // sorgu varsa ayır, yoksa base=url
  if (kind === 'hls' && base.toLowerCase().endsWith('.m3u8')) {
    return base.slice(0, -5) + '.ts' + (query || '')
  }
  if (kind === 'mpegts' && base.toLowerCase().endsWith('.ts')) {
    return base.slice(0, -3) + '.m3u8' + (query || '')
  }
  return null
}

function attachHls(
  video: HTMLVideoElement,
  url: string,
  onInfo: (info: StreamInfo) => void,
  onFatal: () => void
): { destroy: () => void } {
  // enableWorker kapalı: paketlenmiş Electron uygulamasında file:// kökeninden
  // yüklenen worker'lar bazı sistemlerde sessizce başarısız olabiliyor.
  const hls = new Hls({ maxBufferLength: 30, enableWorker: false })
  hls.loadSource(url)
  hls.attachMedia(video)
  hls.on(Hls.Events.LEVEL_SWITCHED, (_evt, data) => {
    const level = hls.levels[data.level]
    if (level) {
      const frameRateAttr = (level.attrs as Record<string, string> | undefined)?.['FRAME-RATE']
      onInfo({
        bitrateKbps: level.bitrate ? Math.round(level.bitrate / 1000) : undefined,
        videoCodec: level.videoCodec,
        audioCodec: level.audioCodec,
        nominalFps: frameRateAttr ? parseFloat(frameRateAttr) : undefined
      })
    }
  })
  hls.on(Hls.Events.ERROR, (_evt, data) => {
    if (data.fatal) onFatal()
  })
  video.play().catch(() => {})
  return { destroy: () => hls.destroy() }
}

function attachMpegts(
  video: HTMLVideoElement,
  url: string,
  onInfo: (info: StreamInfo) => void,
  onFatal: () => void
): { destroy: () => void } {
  const player = mpegts.createPlayer(
    { type: 'mse', isLive: true, url },
    { enableWorker: false, liveBufferLatencyChasing: true }
  )
  player.attachMediaElement(video)
  player.on(mpegts.Events.MEDIA_INFO, (mediaInfo: Record<string, unknown>) => {
    onInfo({
      bitrateKbps:
        typeof mediaInfo.videoDataRate === 'number'
          ? Math.round(mediaInfo.videoDataRate as number)
          : undefined,
      videoCodec: (mediaInfo.videoCodec as string) || undefined,
      audioCodec: (mediaInfo.audioCodec as string) || undefined,
      nominalFps: typeof mediaInfo.fps === 'number' ? (mediaInfo.fps as number) : undefined
    })
  })
  player.on(mpegts.Events.ERROR, onFatal)
  player.load()
  Promise.resolve(player.play()).catch(() => {})
  return {
    destroy: () => {
      try {
        player.destroy()
      } catch {
        /* ignore */
      }
    }
  }
}

export function attachStream(
  video: HTMLVideoElement,
  url: string,
  onFatalError: (message: string) => void
): AttachedPlayer {
  let info: StreamInfo = {}
  let currentKind: EngineKind = detectKind(url)
  let current: { destroy: () => void } | null = null
  let triedAlternate = false

  function tryUrl(targetUrl: string, kind: EngineKind): void {
    currentKind = kind
    const onInfo = (i: StreamInfo): void => {
      info = i
    }
    const onFatal = (): void => {
      const alt = !triedAlternate ? alternateUrl(targetUrl, kind) : null
      if (alt) {
        triedAlternate = true
        current?.destroy()
        const altKind: EngineKind = kind === 'hls' ? 'mpegts' : 'hls'
        if (altKind === 'hls' && Hls.isSupported()) {
          current = attachHls(video, alt, onInfo, onFatal)
          currentKind = 'hls'
        } else if (altKind === 'mpegts' && mpegts.isSupported()) {
          current = attachMpegts(video, alt, onInfo, onFatal)
          currentKind = 'mpegts'
        } else {
          onFatalError('Yayın alınamadı')
        }
      } else {
        onFatalError('Yayın alınamadı. Kanal şu anda yayında olmayabilir.')
      }
    }

    if (kind === 'hls' && Hls.isSupported()) {
      current = attachHls(video, targetUrl, onInfo, onFatal)
    } else if (kind === 'hls' && video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = targetUrl
      video.play().catch(() => {})
      current = { destroy: () => (video.src = '') }
    } else if (kind === 'mpegts' && mpegts.isSupported()) {
      current = attachMpegts(video, targetUrl, onInfo, onFatal)
    } else {
      // Native fallback: mp4/mkv/doğrudan oynatılabilen VOD dosyaları
      video.src = targetUrl
      video.play().catch(() => {})
      current = { destroy: () => (video.src = '') }
    }
  }

  tryUrl(url, currentKind)

  return {
    get kind() {
      return currentKind
    },
    getInfo: () => info,
    destroy: () => current?.destroy()
  }
}
