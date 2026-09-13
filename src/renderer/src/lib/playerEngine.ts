import Hls from 'hls.js'
import mpegts from 'mpegts.js'
import { isProxyAvailable, isRemuxAvailable, proxiedLiveUrl, remuxedLiveUrl } from './proxy'
import { bufferTargetSec, startBufferSec } from './bufferSetting'

export type EngineKind = 'hls' | 'mpegts' | 'native'

export interface StreamInfo {
  bitrateKbps?: number
  videoCodec?: string
  audioCodec?: string
  // Yayının kendi bildirdiği (nominal) kare hızı — pencere odakta değilken
  // tarayıcının kısabileceği gerçek render hızından daha güvenilirdir.
  nominalFps?: number
  // Canlı yayında: geri sarılabilecek süre ve şu an canlının kaç sn gerisinde
  rewindableSec?: number
  behindLiveSec?: number
}

export interface TrackInfo {
  id: number
  label: string
}

// Kesit (son 30 sn) nasıl alınır:
// - 'proxy': .ts canlı yayın yerel aktarıcıdan geçiyor, ana süreç arabellekten kaydeder
// - 'hls':   HLS parçaları burada tutuluyor, baytlar ana sürece gönderilir
// - 'none':  bu akış için canlı kesit alınamıyor
export type ClipMode = 'proxy' | 'hls' | 'none'

interface EngineHandle {
  destroy: () => void
  clipMode: ClipMode
  canRewind?: boolean
  getHlsClip?: (seconds: number) => Uint8Array | null
  getAudioTracks?: () => TrackInfo[]
  getSubtitleTracks?: () => TrackInfo[]
  getCurrentAudioTrack?: () => number
  getCurrentSubtitleTrack?: () => number
  setAudioTrack?: (id: number) => void
  setSubtitleTrack?: (id: number) => void
}

export interface AttachedPlayer {
  kind: EngineKind
  clipMode: ClipMode
  // Canlı yayın arabellekten geri sarılabiliyor mu (yerel aktarıcı yolu)
  canRewind: boolean
  getInfo: () => StreamInfo
  getHlsClip: (seconds: number) => Uint8Array | null
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

// Arabellekte yeterli veri birikene kadar oynatmayı başlatma. Hemen
// başlatınca ilk saniyelerde veri yetişmiyor, görüntü takılıp sonra
// düzeliyordu.
function playWhenBuffered(video: HTMLVideoElement, minAheadSec: number, maxWaitMs: number): () => void {
  const started = performance.now()
  let cancelled = false
  const tick = (): void => {
    if (cancelled) return
    const b = video.buffered
    const ahead = b.length ? b.end(b.length - 1) - video.currentTime : 0
    if (ahead >= minAheadSec || performance.now() - started > maxWaitMs) {
      video.play().catch(() => {})
      return
    }
    setTimeout(tick, 120)
  }
  tick()
  return () => {
    cancelled = true
  }
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

  // Son ~45 sn'lik .ts parçalarını kesit için tut
  const frags: { duration: number; data: Uint8Array }[] = []
  let fragSeconds = 0
  let fragsAreTs = true

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
  hls.on(Hls.Events.FRAG_LOADED, (_evt, data) => {
    if (data.frag.type !== 'main') return
    const payload = new Uint8Array(data.payload as ArrayBuffer)
    if (payload[0] !== 0x47) {
      // fMP4 parçaları tek başına birleştirilemez; bu akışta kesit desteklenmez
      fragsAreTs = false
      return
    }
    frags.push({ duration: data.frag.duration, data: payload.slice() })
    fragSeconds += data.frag.duration
    while (frags.length > 1 && fragSeconds - frags[0].duration > 45) {
      fragSeconds -= frags[0].duration
      frags.shift()
    }
  })
  hls.on(Hls.Events.ERROR, (_evt, data) => {
    if (data.fatal) onFatal()
  })
  video.play().catch(() => {})
  return {
    destroy: () => hls.destroy(),
    get clipMode(): ClipMode {
      return fragsAreTs && frags.length > 0 ? 'hls' : 'none'
    },
    getHlsClip: (seconds) => {
      if (!fragsAreTs || frags.length === 0) return null
      const picked: Uint8Array[] = []
      let total = 0
      for (let i = frags.length - 1; i >= 0 && total < seconds; i--) {
        picked.unshift(frags[i].data)
        total += frags[i].duration
      }
      const size = picked.reduce((n, p) => n + p.length, 0)
      const out = new Uint8Array(size)
      let offset = 0
      for (const p of picked) {
        out.set(p, offset)
        offset += p.length
      }
      return out
    },
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
  const viaProxy = isProxyAvailable()
  const player = mpegts.createPlayer(
    {
      type: 'mse',
      isLive: true,
      url: viaProxy ? proxiedLiveUrl(url) : url
    },
    {
      enableWorker: false,
      enableStashBuffer: true,
      stashInitialSize: 512 * 1024,
      // Eskiden "latency chasing" kullanıyorduk: gecikme büyüyünce ileri
      // ATLIYORDU. Ölçümde bir kanalda ilk 18 sn'de onlarca atlama çıktı —
      // "başta takılıp sonra düzelme" bunun yüzündendi. liveSync ise atlamak
      // yerine oynatmayı çok hafif (%10) hızlandırarak canlıya yetişiyor;
      // gözle fark edilmiyor.
      liveBufferLatencyChasing: false,
      liveSync: true,
      liveSyncMaxLatency: 3.5,
      liveSyncTargetLatency: 1.8,
      liveSyncPlaybackRate: 1.1,
      lazyLoad: false,
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
  const cancelStart = playWhenBuffered(video, 1.2, 5000)
  return {
    clipMode: viaProxy ? 'proxy' : 'none',
    destroy: () => {
      cancelStart()
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

// Canlı .ts yayını: ana süreçteki ffmpeg yayını parçalı MP4'e çevirir,
// tarayıcının kendi oynatıcısı oynatır. mpegts.js, sunucunun canlı hızında
// damlattığı veriyle ilk karede takılıyordu; bu yol o sorunu yaşamıyor.
function attachRemux(
  video: HTMLVideoElement,
  url: string,
  onInfo: (info: StreamInfo) => void,
  // played: yayın hiç görüntü verdi mi (verdiyse bağlantı sonradan koptu)
  onFatal: (played: boolean) => void,
  // > 0: canlının bu kadar saniye gerisinden başla (geri sarma)
  backSec = 0
): EngineHandle {
  const src = remuxedLiveUrl(url, backSec)
  let done = false
  const fail = (): void => {
    if (done) return
    done = true
    onFatal(video.currentTime > 0.5)
  }
  // Canlı yayında 'ended' = bağlantı koptu (ffmpeg 15 sn veri alamadı)
  const onError = (): void => {
    if (video.currentSrc === src) fail()
  }
  video.addEventListener('error', onError)
  video.addEventListener('ended', onError)
  video.src = src

  // Tampon ayarına göre, oynatmaya başlamadan önce yeterli yedek biriktir
  // (en fazla 9 sn beklenir).
  const startedAt = performance.now()
  let started = false
  const tryStart = (behind: number): void => {
    if (started || done) return
    if (behind >= startBufferSec(video) || performance.now() - startedAt > 9000) {
      started = true
      video.play().catch(() => {})
    }
  }
  if (startBufferSec(video) === 0) {
    started = true
    video.play().catch(() => {})
  }

  // Yedek yastığı: sunucu veriyi düzensiz aralıklarla gönderdiğinde elde az
  // veri varken kısa bir gecikme görüntüyü dondurur. Elimizdeki gerçek yedek
  // = ffmpeg'in verdiği yayın süresi − oynatılan konum (tarayıcının
  // "buffered" değeri bunu göstermiyor, yalnızca birkaç saniye önünü okuyor).
  // Yedek azsa oynatmayı fark edilmeyecek kadar yavaşlatıp (%3) yaklaşık
  // 4 sn biriktiriyoruz; çok birikirse (ör. uzun duraklatmadan sonra)
  // hafifçe hızlanıp canlıya yaklaşıyoruz.
  // behind: canlının toplam kaç sn gerisindeyiz (kuyrukta bekleyen veri dahil)
  const pace = (outTimeSec: number | undefined, behind: number): void => {
    if (!started || outTimeSec === undefined || video.paused || video.readyState < 3) return
    const cushion = outTimeSec - video.currentTime
    const target = bufferTargetSec(video)
    const current = video.playbackRate
    let rate = 1
    if (cushion < 1.5) rate = 0.92
    else if (behind < target * 0.4) rate = 0.95
    else if (behind < target * 0.75) rate = 0.97
    else if (behind < target) rate = current < 1 ? 0.97 : 1
    else if (behind > target + 8) rate = 1.05
    else if (behind > target + 4) rate = current > 1 ? 1.05 : 1
    // Kullanıcı bilerek geri sardıysa canlıya yetişmek için hızlanma
    if (backSec > 0 && rate > 1) rate = 1
    if (current !== rate) video.playbackRate = rate
  }

  const pollInfo = (): void => {
    window.iptv.proxy
      .liveInfo()
      .then((i) => {
        if (done) return
        const cushion =
          i.outTimeSec !== undefined ? Math.max(0, i.outTimeSec - video.currentTime) : 0
        const behind = (i.queuedSec ?? 0) + cushion
        onInfo({
          bitrateKbps: i.bitrateKbps,
          videoCodec: i.videoCodec,
          audioCodec: i.audioCodec,
          nominalFps: i.fps,
          rewindableSec: i.ringSec,
          behindLiveSec: i.outTimeSec !== undefined ? behind : undefined
        })
        tryStart(behind)
        pace(i.outTimeSec, behind)
      })
      .catch(() => {})
  }
  const infoTimer = setInterval(pollInfo, 500)
  pollInfo()

  return {
    clipMode: 'proxy',
    canRewind: true,
    destroy: () => {
      done = true
      clearInterval(infoTimer)
      video.playbackRate = 1
      video.removeEventListener('error', onError)
      video.removeEventListener('ended', onError)
      // src'yi kaldırıp load() çağırmak bağlantıyı hemen kapatır (hata olayı üretmez)
      video.removeAttribute('src')
      video.load()
    }
  }
}

export function attachStream(
  video: HTMLVideoElement,
  url: string,
  onFatalError: (message: string) => void,
  // onStatus: bağlantı koptu ve sessizce yeniden bağlanılıyor bilgisi
  options: { liveBackSec?: number; onStatus?: (status: 'reconnecting') => void } = {}
): AttachedPlayer {
  let info: StreamInfo = {}
  let currentKind: EngineKind = detectKind(url)
  // Canlı aktarıcıyı kullanmayan içerik (film/dizi, HLS) açılıyorsa önceki
  // canlı yayının sunucu bağlantısını hemen bırak (tek bağlantılı hesaplar).
  if (!(currentKind === 'mpegts' && isProxyAvailable())) window.iptv.proxy.releaseLive()
  let current: EngineHandle | null = null
  let triedAlternate = false

  function nativeHandle(targetUrl: string): EngineHandle {
    video.src = targetUrl
    video.play().catch(() => {})
    return { clipMode: 'none', destroy: () => (video.src = '') }
  }

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
      current = nativeHandle(targetUrl)
    } else if (kind === 'mpegts' && isRemuxAvailable()) {
      // Yayın oynarken bağlantı koparsa hata göstermeden hemen yeniden bağlan
      // (15 sn içinde tekrar koparsa normal hata/yeniden deneme akışına düş).
      // Hiç açılamadıysa (ör. tarayıcının çözemediği bir codec) aynı adresi
      // mpegts.js ile dene; o da olmazsa normal yedek zinciri devam eder.
      let lastReconnect = 0
      const startRemux = (backSec: number): void => {
        current = attachRemux(
          video,
          targetUrl,
          onInfo,
          (played) => {
            current?.destroy()
            if (played && Date.now() - lastReconnect > 15_000) {
              lastReconnect = Date.now()
              options.onStatus?.('reconnecting')
              startRemux(0)
            } else if (!played && mpegts.isSupported()) {
              current = attachMpegts(video, targetUrl, onInfo, onFatal)
            } else {
              onFatal()
            }
          },
          backSec
        )
      }
      startRemux(options.liveBackSec ?? 0)
    } else if (kind === 'mpegts' && mpegts.isSupported()) {
      current = attachMpegts(video, targetUrl, onInfo, onFatal)
    } else {
      // Native fallback: mp4/mkv/doğrudan oynatılabilen VOD dosyaları
      current = nativeHandle(targetUrl)
    }
  }

  tryUrl(url, currentKind)

  return {
    get kind() {
      return currentKind
    },
    get clipMode() {
      return current?.clipMode ?? 'none'
    },
    get canRewind() {
      return current?.canRewind ?? false
    },
    getInfo: () => info,
    getHlsClip: (seconds) => current?.getHlsClip?.(seconds) ?? null,
    getAudioTracks: () => current?.getAudioTracks?.() || [],
    getSubtitleTracks: () => current?.getSubtitleTracks?.() || [],
    getCurrentAudioTrack: () => current?.getCurrentAudioTrack?.() ?? -1,
    getCurrentSubtitleTrack: () => current?.getCurrentSubtitleTrack?.() ?? -1,
    setAudioTrack: (id) => current?.setAudioTrack?.(id),
    setSubtitleTrack: (id) => current?.setSubtitleTrack?.(id),
    destroy: () => current?.destroy()
  }
}
