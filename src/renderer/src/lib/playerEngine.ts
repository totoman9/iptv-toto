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

export interface TrackInfo {
  id: number
  label: string
}

interface EngineHandle {
  destroy: () => void
  getAudioTracks?: () => TrackInfo[]
  getSubtitleTracks?: () => TrackInfo[]
  getCurrentAudioTrack?: () => number
  getCurrentSubtitleTrack?: () => number
  setAudioTrack?: (id: number) => void
  setSubtitleTrack?: (id: number) => void
}

export interface AttachedPlayer {
  kind: EngineKind
  getInfo: () => StreamInfo
  // Yalnızca HLS yayınlarında (ve yayının birden fazla ses/altyazı parçası
  // sunduğu durumlarda) dolu liste döner; desteklenmiyorsa boş dizi.
  getAudioTracks: () => TrackInfo[]
  getSubtitleTracks: () => TrackInfo[]
  getCurrentAudioTrack: () => number
  getCurrentSubtitleTrack: () => number
  setAudioTrack: (id: number) => void
  setSubtitleTrack: (id: number) => void
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
): EngineHandle {
  // enableWorker: false — bu Electron sürümünde worker açıkken mpegts/hls
  // akışı bazen tamamen donuyor (init segmenti alınıp hiç veri iletilmiyor).
  // Ana iş parçacığında biraz daha CPU harcasa da güvenilir çalışıyor.
  const hls = new Hls({ maxBufferLength: 30, enableWorker: false })
  hls.subtitleDisplay = true
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
  return {
    destroy: () => hls.destroy(),
    getAudioTracks: () =>
      hls.audioTracks.map((t, i) => ({ id: i, label: t.name || t.lang || `Ses ${i + 1}` })),
    getSubtitleTracks: () =>
      hls.subtitleTracks.map((t, i) => ({ id: i, label: t.name || t.lang || `Altyazı ${i + 1}` })),
    getCurrentAudioTrack: () => hls.audioTrack,
    getCurrentSubtitleTrack: () => hls.subtitleTrack,
    setAudioTrack: (id) => {
      hls.audioTrack = id
    },
    setSubtitleTrack: (id) => {
      hls.subtitleTrack = id
      hls.subtitleDisplay = id !== -1
    }
  }
}

function attachMpegts(
  video: HTMLVideoElement,
  url: string,
  onInfo: (info: StreamInfo) => void,
  onFatal: () => void
): EngineHandle {
  const player = mpegts.createPlayer(
    { type: 'mse', isLive: true, url },
    {
      enableWorker: false,
      enableStashBuffer: true,
      // Canlıya yapışmak için arabellek büyüyünce ileri atlıyor; varsayılan
      // eşikler çok sık tetiklenip "fotoğraf gibi" atlamalara yol açıyordu.
      // Eşikleri gevşeterek (birkaç saniye ekstra gecikme pahasına) daha
      // az sık ve daha yumuşak geçişler hedefliyoruz.
      liveBufferLatencyChasing: true,
      liveBufferLatencyMaxLatency: 4.0,
      liveBufferLatencyMinRemain: 1.5,
      autoCleanupSourceBuffer: true,
      autoCleanupMaxBackwardDuration: 30,
      autoCleanupMinBackwardDuration: 10
    }
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
    // mpegts.js (.ts) bu sürümde ses/altyazı parçası değiştirmeyi
    // desteklemiyor — bu yüzden get*Tracks tanımlanmıyor, üstteki
    // sarmalayıcı bunun için boş liste döner.
  }
}

export function attachStream(
  video: HTMLVideoElement,
  url: string,
  onFatalError: (message: string) => void
): AttachedPlayer {
  let info: StreamInfo = {}
  let currentKind: EngineKind = detectKind(url)
  let current: EngineHandle | null = null
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
    getAudioTracks: () => current?.getAudioTracks?.() || [],
    getSubtitleTracks: () => current?.getSubtitleTracks?.() || [],
    getCurrentAudioTrack: () => current?.getCurrentAudioTrack?.() ?? -1,
    getCurrentSubtitleTrack: () => current?.getCurrentSubtitleTrack?.() ?? -1,
    setAudioTrack: (id) => current?.setAudioTrack?.(id),
    setSubtitleTrack: (id) => current?.setSubtitleTrack?.(id),
    destroy: () => current?.destroy()
  }
}
