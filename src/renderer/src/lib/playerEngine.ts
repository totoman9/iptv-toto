import Hls from 'hls.js'
import mpegts from 'mpegts.js'

export type EngineKind = 'hls' | 'mpegts' | 'native'

export interface StreamInfo {
  bitrateKbps?: number
  videoCodec?: string
  audioCodec?: string
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

export function attachStream(
  video: HTMLVideoElement,
  url: string,
  onFatalError: (message: string) => void
): AttachedPlayer {
  const kind = detectKind(url)

  if (kind === 'hls' && Hls.isSupported()) {
    const hls = new Hls({
      maxBufferLength: 30,
      enableWorker: true
    })
    let info: StreamInfo = {}
    hls.loadSource(url)
    hls.attachMedia(video)
    hls.on(Hls.Events.LEVEL_SWITCHED, (_evt, data) => {
      const level = hls.levels[data.level]
      if (level) {
        info = {
          bitrateKbps: level.bitrate ? Math.round(level.bitrate / 1000) : undefined,
          videoCodec: level.videoCodec,
          audioCodec: level.audioCodec
        }
      }
    })
    hls.on(Hls.Events.ERROR, (_evt, data) => {
      if (data.fatal) {
        onFatalError('Yayın alınamadı: ' + (data.details || 'bilinmeyen hata'))
      }
    })
    video.play().catch(() => {})
    return {
      kind: 'hls',
      getInfo: () => info,
      destroy: () => hls.destroy()
    }
  }

  if (kind === 'hls' && video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = url
    video.play().catch(() => {})
    return { kind: 'native', getInfo: () => ({}), destroy: () => (video.src = '') }
  }

  if (kind === 'mpegts' && mpegts.isSupported()) {
    const player = mpegts.createPlayer(
      { type: 'mse', isLive: true, url },
      { enableWorker: true, liveBufferLatencyChasing: true }
    )
    let info: StreamInfo = {}
    player.attachMediaElement(video)
    player.on(mpegts.Events.MEDIA_INFO, (mediaInfo: Record<string, unknown>) => {
      info = {
        bitrateKbps:
          typeof mediaInfo.videoDataRate === 'number'
            ? Math.round(mediaInfo.videoDataRate as number)
            : undefined,
        videoCodec: (mediaInfo.videoCodec as string) || undefined,
        audioCodec: (mediaInfo.audioCodec as string) || undefined
      }
    })
    player.on(mpegts.Events.ERROR, () => {
      onFatalError('Yayın alınamadı (mpegts)')
    })
    player.load()
    Promise.resolve(player.play()).catch(() => {})
    return {
      kind: 'mpegts',
      getInfo: () => info,
      destroy: () => {
        try {
          player.destroy()
        } catch {
          /* ignore */
        }
      }
    }
  }

  // Native fallback: mp4/mkv/doğrudan oynatılabilen VOD dosyaları
  video.src = url
  video.play().catch(() => {})
  return { kind: 'native', getInfo: () => ({}), destroy: () => (video.src = '') }
}
