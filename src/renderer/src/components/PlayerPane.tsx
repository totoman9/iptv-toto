import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react'
import type { ClipResult, EpgProgram, PlayableItem, SourceConfig } from '../../../shared/types'
import { attachStream, type AttachedPlayer, type TrackInfo } from '../lib/playerEngine'
import { ChannelDrawer, type ChannelDrawerData } from './ChannelDrawer'
import { PlayerSettingsPanel } from './PlayerSettingsPanel'
import { ShortcutHelp } from './ShortcutHelp'
import { SubtitleTab, type ExternalSubtitle } from './SubtitleTab'
import { useStreamStats } from '../hooks/useStreamStats'
import { usePictureSettings } from '../hooks/usePictureSettings'
import { pictureFilter } from '../lib/pictureSettings'
import { loadLeveling, saveLeveling, setVolumeLeveling } from '../lib/audioLeveling'
import {
  getBufferMode,
  looksUhd,
  setBufferMode,
  setLargeBufferHint,
  type BufferMode
} from '../lib/bufferSetting'
import { getShortEpg } from '../lib/xtream'
import { getProgress, saveProgress } from '../lib/continueWatching'
import { addWatchTime } from '../lib/library'
import {
  IconArrowLeft,
  IconCamera,
  IconChannels,
  IconClose,
  IconExpand,
  IconGrid,
  IconKeyboard,
  IconLiveTv,
  IconMiniWindow,
  IconMore,
  IconMute,
  IconPause,
  IconPip,
  IconPlay,
  IconRecord,
  IconRefresh,
  IconRewind,
  IconScissors,
  IconSkipNext,
  IconSkipPrev,
  IconSliders,
  IconStar,
  IconStop,
  IconVolume,
  IconWarning
} from './Icons'

export type { PlayableItem }

// docked:  Canlı TV / Favoriler sekmesinde sağ sütunda; video kendi oranında,
//          altında bilgi paneli
// mini:    Film/Dizi ekranına geçilince canlı yayın köşede küçük pencerede sürer
// theater: Film/dizi oynatılırken tüm pencereyi kaplar (Netflix gibi)
export type PlayerMode = 'docked' | 'mini' | 'theater'

interface Props {
  item: PlayableItem | null
  source: SourceConfig | null
  mode: PlayerMode
  isFavorite?: boolean
  onToggleFavorite?: () => void
  onClose?: () => void
  onExpand?: () => void
  // Canlı yayında önceki/sonraki kanal ve tam ekran kanal listesi
  onPrev?: () => void
  onNext?: () => void
  drawer?: ChannelDrawerData
  // Oynatmayı tamamen durdur (uyku zamanlayıcısı)
  onStop?: () => void
  // Başka bir öğeyi oynat (dizide sıradaki bölüm)
  onPlayItem?: (item: PlayableItem) => void
  // Mini pencere (her zaman üstte)
  compact?: boolean
  onToggleCompact?: () => void
  // Bu kanal şu an kaydediliyor mu; kaydı başlat/durdur
  recording?: boolean
  onRecordToggle?: (info: { programTitle?: string; end?: number }) => void
  // Başka bir kanal kaydediliyorsa o kaydın adı (bu kanal açılamaz)
  blockedByRecording?: string
  // Çoklu ekranı aç (canlı yayında)
  onOpenMultiView?: () => void
}

const VOLUME_STORAGE_KEY = 'iptv-toto-volume'
// Sıradaki bölüm kartı, bölümün son bu kadar saniyesinde çıkar
const NEXT_EPISODE_LEAD_SEC = 25
const NEXT_EPISODE_COUNTDOWN = 10

function loadStoredVolume(): { volume: number; muted: boolean } {
  try {
    const raw = window.localStorage.getItem(VOLUME_STORAGE_KEY)
    if (!raw) return { volume: 1, muted: false }
    const parsed = JSON.parse(raw)
    return {
      volume: typeof parsed.volume === 'number' ? parsed.volume : 1,
      muted: !!parsed.muted
    }
  } catch {
    return { volume: 1, muted: false }
  }
}

function saveStoredVolume(volume: number, muted: boolean): void {
  try {
    window.localStorage.setItem(VOLUME_STORAGE_KEY, JSON.stringify({ volume, muted }))
  } catch {
    /* ignore */
  }
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

function formatClock(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// "Diğer" menüsündeki bir satır: simge + ne işe yaradığı + kısayol tuşu
function MoreItem({
  icon,
  label,
  kbd,
  onClick
}: {
  icon: ReactElement
  label: string
  kbd?: string
  onClick: () => void
}): ReactElement {
  return (
    <button className="more-item" onClick={onClick}>
      <span className="more-item-icon">{icon}</span>
      <span className="more-item-label">{label}</span>
      {kbd && <kbd>{kbd}</kbd>}
    </button>
  )
}

type ToastState =
  | { status: 'idle' }
  | { status: 'saving'; label: string }
  | { status: 'done'; path: string; label: string }
  | { status: 'error'; error: string }

export function PlayerPane({
  item,
  source,
  mode,
  isFavorite,
  onToggleFavorite,
  onClose,
  onExpand,
  onPrev,
  onNext,
  drawer,
  onStop,
  onPlayItem,
  compact = false,
  onToggleCompact,
  recording = false,
  onRecordToggle,
  blockedByRecording,
  onOpenMultiView
}: Props): ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [player, setPlayer] = useState<AttachedPlayer | null>(null)
  const [error, setError] = useState<string | null>(null)
  const errorRef = useRef<string | null>(null)
  const [epg, setEpg] = useState<EpgProgram[]>([])
  const [aspect, setAspect] = useState(16 / 9)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const [isPlaying, setIsPlaying] = useState(true)
  const [isMuted, setIsMuted] = useState(false)
  const [volume, setVolume] = useState(1)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [controlsVisible, setControlsVisible] = useState(true)
  const [retryTick, setRetryTick] = useState(0)
  const [audioTracks, setAudioTracks] = useState<TrackInfo[]>([])
  const [subtitleTracks, setSubtitleTracks] = useState<TrackInfo[]>([])
  const [currentAudio, setCurrentAudio] = useState(-1)
  const [currentSubtitle, setCurrentSubtitle] = useState(-1)
  const [moreOpen, setMoreOpen] = useState(false)
  const [externalSub, setExternalSub] = useState<ExternalSubtitle | null>(null)
  const [subOffset, setSubOffset] = useState(0)
  const [toast, setToast] = useState<ToastState>({ status: 'idle' })
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [leveling, setLeveling] = useState(loadLeveling)
  const [bufferMode, setBufferModeState] = useState<BufferMode>(getBufferMode)
  const [sleepAt, setSleepAt] = useState<number | null>(null)
  const [clockNow, setClockNow] = useState(() => Date.now())
  // Canlı yayını geri sarma: hangi kanal için kaç saniye geriden oynatılıyor
  const [rewind, setRewind] = useState<{ url: string; back: number }>({ url: '', back: 0 })
  const [liveMeta, setLiveMeta] = useState<{ behind?: number; rewindable?: number }>({})
  const [nextDismissedFor, setNextDismissedFor] = useState<string | null>(null)
  const [countdown, setCountdown] = useState<number | null>(null)
  // Bağlantı durumu (kullanıcıya "bağlanılıyor / takıldı / yeniden bağlanılıyor" göstermek için)
  const [conn, setConn] = useState<'idle' | 'connecting' | 'playing' | 'stalled' | 'reconnecting'>('idle')
  const [retryCount, setRetryCount] = useState(0)
  const [retryIn, setRetryIn] = useState<number | null>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const resumedForUrl = useRef<string | null>(null)

  const picture = usePictureSettings()
  const stats = useStreamStats(videoRef, player)
  const liveBack = item && rewind.url === item.url ? rewind.back : 0

  // Ses seviyesini bir kere, uygulama açılışında hatırlanan değere ayarla
  // (video elementi tek örnek olduğu için kanal/film değişse de korunur).
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const { volume: storedVolume, muted: storedMuted } = loadStoredVolume()
    video.volume = storedVolume
    video.muted = storedMuted
    setVolume(storedVolume)
    setIsMuted(storedMuted)
  }, [])

  useEffect(() => {
    setError(null)
    setToast({ status: 'idle' })
    setConn(item ? 'connecting' : 'idle')
    const video = videoRef.current
    if (!video || !item) {
      if (video) {
        video.removeAttribute('src')
        video.load()
      }
      window.iptv.proxy.releaseLive()
      return
    }

    setLargeBufferHint(item.isLive && looksUhd(`${item.name} ${item.group}`))
    const attached = attachStream(video, item.url, (message) => setError(message), {
      liveBackSec: item.isLive ? liveBack : 0,
      onStatus: (status) => setConn(status)
    })
    setPlayer(attached)

    return () => {
      attached.destroy()
      setPlayer(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.url, retryTick, liveBack])

  useEffect(() => {
    errorRef.current = error
  }, [error])

  // Bağlantı hatası varsa geri sayımla otomatik tekrar dene: ilk denemeler
  // 5 sn arayla, sonra sunucuyu yormamak için 15 ve 30 sn arayla.
  useEffect(() => {
    setRetryCount(0)
  }, [item?.url])

  useEffect(() => {
    if (!error || !item) {
      setRetryIn(null)
      return
    }
    setRetryIn(retryCount < 3 ? 5 : retryCount < 6 ? 15 : 30)
    const iv = setInterval(() => setRetryIn((s) => (s === null ? null : s - 1)), 1000)
    return () => clearInterval(iv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error, item?.url, retryCount])

  useEffect(() => {
    if (retryIn !== null && retryIn <= 0 && errorRef.current) {
      setRetryCount((c) => c + 1)
      retry()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryIn])

  // Ses/altyazı parçaları yalnızca HLS (.m3u8) yayınlarında ve manifest
  // ayrıştırıldıktan bir süre sonra belli olur; birkaç saniye yoklayıp duruyoruz.
  useEffect(() => {
    setAudioTracks([])
    setSubtitleTracks([])
    if (!player) return
    let ticks = 0
    const iv = setInterval(() => {
      ticks += 1
      setAudioTracks(player.getAudioTracks())
      setSubtitleTracks(player.getSubtitleTracks())
      setCurrentAudio(player.getCurrentAudioTrack())
      setCurrentSubtitle(player.getCurrentSubtitleTrack())
      if (ticks >= 10) clearInterval(iv)
    }, 500)
    return () => clearInterval(iv)
  }, [player])

  // Canlı yayında geri sarma bilgisi (canlının kaç sn gerisinde, ne kadar geri gidilebilir)
  useEffect(() => {
    setLiveMeta({})
    if (!player || !item?.isLive) return
    const iv = setInterval(() => {
      const info = player.getInfo()
      setLiveMeta({ behind: info.behindLiveSec, rewindable: info.rewindableSec })
    }, 1000)
    return () => clearInterval(iv)
  }, [player, item?.isLive])

  // Kaldığın yerden devam et (canlı olmayan içerikler için)
  useEffect(() => {
    const video = videoRef.current
    if (!video || !item || item.isLive) return
    resumedForUrl.current = null

    const onLoadedMeta = (): void => {
      if (resumedForUrl.current === item.url) return
      resumedForUrl.current = item.url
      getProgress(item.id).then((saved) => {
        if (!saved || !video.duration) return
        const nearEnd = saved.positionSeconds >= video.duration * 0.93
        if (saved.positionSeconds > 5 && !nearEnd) {
          video.currentTime = saved.positionSeconds
        }
      })
    }
    video.addEventListener('loadedmetadata', onLoadedMeta)
    return () => video.removeEventListener('loadedmetadata', onLoadedMeta)
  }, [item])

  // İzleme konumunu belirli aralıklarla kaydet (dizide hangi bölümde
  // kalındığını bilmek için bölüm/sezon bilgisiyle birlikte)
  useEffect(() => {
    const video = videoRef.current
    // Kayıtlar "izlemeye devam et" listesine girmesin
    if (!video || !item || item.isLive || item.kind === 'recording') return
    const entryFor = (position: number): Parameters<typeof saveProgress>[0] => ({
      id: item.id,
      title: item.name,
      logo: item.logo,
      positionSeconds: position,
      durationSeconds: video.duration,
      updatedAt: Date.now(),
      kind: item.kind === 'episode' ? 'episode' : 'movie',
      url: item.url,
      group: item.group,
      seriesId: item.seriesId,
      seriesName: item.seriesName,
      season: item.season,
      episodeNum: item.episodeNum
    })
    let lastSaved = 0
    const onTime = (): void => {
      const t = video.currentTime
      if (Math.abs(t - lastSaved) < 8 || !video.duration) return
      lastSaved = t
      saveProgress(entryFor(t))
    }
    video.addEventListener('timeupdate', onTime)
    return () => {
      video.removeEventListener('timeupdate', onTime)
      if (video.duration && video.currentTime > 5) saveProgress(entryFor(video.currentTime))
    }
  }, [item])

  // Video elementinin gerçek durumunu (oynatma/duraklatma/süre/oran) dinle
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const onPlay = (): void => setIsPlaying(true)
    const onPause = (): void => setIsPlaying(false)
    const onTime = (): void => setCurrentTime(video.currentTime)
    const onDuration = (): void => setDuration(video.duration || 0)
    const onSize = (): void => {
      if (video.videoWidth && video.videoHeight) setAspect(video.videoWidth / video.videoHeight)
    }
    const onVolume = (): void => {
      setVolume(video.volume)
      setIsMuted(video.muted)
      saveStoredVolume(video.volume, video.muted)
    }

    let stallTimer: ReturnType<typeof setTimeout> | null = null
    const onPlaying = (): void => {
      if (stallTimer) clearTimeout(stallTimer)
      setConn('playing')
      setRetryCount(0)
    }
    // Kısa beklemeler (ör. 0,5 sn) için uyarı gösterme; 1,5 sn'yi geçerse göster
    const onWaiting = (): void => {
      if (stallTimer) clearTimeout(stallTimer)
      stallTimer = setTimeout(() => setConn((c) => (c === 'playing' ? 'stalled' : c)), 1500)
    }
    video.addEventListener('playing', onPlaying)
    video.addEventListener('waiting', onWaiting)
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('timeupdate', onTime)
    video.addEventListener('durationchange', onDuration)
    video.addEventListener('loadedmetadata', onDuration)
    video.addEventListener('loadedmetadata', onSize)
    video.addEventListener('resize', onSize)
    video.addEventListener('volumechange', onVolume)

    return () => {
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('timeupdate', onTime)
      video.removeEventListener('durationchange', onDuration)
      video.removeEventListener('loadedmetadata', onDuration)
      video.removeEventListener('loadedmetadata', onSize)
      video.removeEventListener('resize', onSize)
      video.removeEventListener('volumechange', onVolume)
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('waiting', onWaiting)
      if (stallTimer) clearTimeout(stallTimer)
    }
  }, [item?.url])

  // Oynatma hızı (yalnızca film/dizi) — yeni içerikte normale döner
  useEffect(() => {
    setSpeed(1)
  }, [item?.url])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !item || item.isLive) return
    const apply = (): void => {
      video.playbackRate = speed
    }
    apply()
    video.addEventListener('loadedmetadata', apply)
    return () => video.removeEventListener('loadedmetadata', apply)
  }, [speed, item])

  // Ses seviyesi dengeleme
  useEffect(() => {
    const video = videoRef.current
    if (video) {
      try {
        setVolumeLeveling(video, leveling)
      } catch {
        /* ses grafiği kurulamadı; ses normal şekilde çalmaya devam eder */
      }
    }
    saveLeveling(leveling)
  }, [leveling])

  // Uyku zamanlayıcısı
  useEffect(() => {
    if (sleepAt === null) return
    const iv = setInterval(() => {
      const now = Date.now()
      setClockNow(now)
      if (now >= sleepAt) {
        setSleepAt(null)
        videoRef.current?.pause()
        if (document.fullscreenElement) void document.exitFullscreen()
        onStop?.()
      }
    }, 1000)
    return () => clearInterval(iv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sleepAt])

  // ----- Sıradaki bölüm -----
  const remaining = duration - currentTime
  const showNext =
    !!item?.nextEpisode &&
    !item.isLive &&
    duration > 60 &&
    remaining <= NEXT_EPISODE_LEAD_SEC &&
    nextDismissedFor !== item.id

  function playNextEpisode(): void {
    if (!item?.nextEpisode) return
    setCountdown(null)
    onPlayItem?.(item.nextEpisode)
  }

  useEffect(() => {
    if (!showNext) {
      setCountdown(null)
      return
    }
    setCountdown(NEXT_EPISODE_COUNTDOWN)
    const iv = setInterval(() => setCountdown((c) => (c === null ? null : c - 1)), 1000)
    return () => clearInterval(iv)
  }, [showNext])

  useEffect(() => {
    if (countdown !== null && countdown <= 0) playNextEpisode()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown])

  // Bölüm kart çıkmadan biterse (ör. çok kısa jenerik) doğrudan geç
  useEffect(() => {
    const video = videoRef.current
    if (!video || !item?.nextEpisode || item.isLive) return
    const onEnded = (): void => {
      if (nextDismissedFor !== item.id) playNextEpisode()
    }
    video.addEventListener('ended', onEnded)
    return () => video.removeEventListener('ended', onEnded)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, nextDismissedFor])

  useEffect(() => {
    const onFs = (): void => {
      const fs = document.fullscreenElement === wrapRef.current
      setIsFullscreen(fs)
      if (!fs) setDrawerOpen(false)
    }
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  useEffect(() => {
    if (!item?.isLive || !source || source.type !== 'xtream' || item.streamId === undefined) {
      setEpg([])
      return
    }
    let cancelled = false
    const load = (): void => {
      getShortEpg(source, item.streamId!, 6)
        .then((programs) => {
          if (!cancelled) setEpg(programs.filter((p) => p.end > Date.now()))
        })
        .catch(() => {
          /* program bilgisi alınamadı; bilgi paneli "program bilgisi yok" der */
        })
    }
    load()
    // Program değişimlerini yakalamak için ara ara tazele
    const iv = setInterval(load, 5 * 60 * 1000)
    return () => {
      cancelled = true
      clearInterval(iv)
    }
  }, [item?.isLive, item?.streamId, source])

  // Kontrolleri fare hareketsizken otomatik gizle (oynatılırken). Ayar
  // paneli açıkken gizleme.
  useEffect(() => {
    function resetTimer(): void {
      setControlsVisible(true)
      if (hideTimer.current) clearTimeout(hideTimer.current)
      if (isPlaying && !panelOpen && !moreOpen) {
        hideTimer.current = setTimeout(() => setControlsVisible(false), 3200)
      }
    }
    const onLeave = (): void => {
      if (isPlaying && !panelOpen && !moreOpen) setControlsVisible(false)
    }
    resetTimer()
    const el = wrapRef.current
    el?.addEventListener('mousemove', resetTimer)
    el?.addEventListener('mouseleave', onLeave)
    return () => {
      el?.removeEventListener('mousemove', resetTimer)
      el?.removeEventListener('mouseleave', onLeave)
      if (hideTimer.current) clearTimeout(hideTimer.current)
    }
  }, [isPlaying, item?.id, panelOpen, moreOpen])

  // Klavye kısayolları (tam liste: ? tuşu). Mini moddayken (film/dizi
  // ekranında gezinirken) kısayollar devre dışı.
  useEffect(() => {
    if (!item || mode === 'mini') return
    const currentItem = item

    function isTypingTarget(el: EventTarget | null): boolean {
      if (!(el instanceof HTMLElement)) return false
      return ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable
    }

    function onKeyDown(e: KeyboardEvent): void {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey) return
      const video = videoRef.current
      if (!video) return

      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault()
          togglePlay()
          break
        case 'm':
          toggleMute()
          break
        case 'f':
          toggleFullscreen()
          break
        case 'c':
          void saveClip()
          break
        case 's':
          void takeScreenshot()
          break
        case 'p':
          void togglePip()
          break
        case 'w':
          onToggleCompact?.()
          break
        case 'g':
          setPanelOpen((v) => !v)
          break
        case 'j':
          rewindBy(10)
          break
        case '?':
          setHelpOpen((v) => !v)
          break
        case 'Escape':
          if (helpOpen) setHelpOpen(false)
          else if (panelOpen) setPanelOpen(false)
          else if (moreOpen) setMoreOpen(false)
          else if (drawerOpen) setDrawerOpen(false)
          else if (compact) onToggleCompact?.()
          else if (mode === 'theater' && !document.fullscreenElement) onClose?.()
          break
        case 'l':
          if (drawer && document.fullscreenElement) setDrawerOpen((v) => !v)
          break
        case 'PageUp':
          e.preventDefault()
          onPrev?.()
          break
        case 'PageDown':
          e.preventDefault()
          onNext?.()
          break
        case 'ArrowUp':
          e.preventDefault()
          video.volume = Math.min(1, video.volume + 0.05)
          video.muted = false
          break
        case 'ArrowDown':
          e.preventDefault()
          video.volume = Math.max(0, video.volume - 0.05)
          break
        // Canlı yayında sağ/sol = sonraki/önceki kanal, diğerlerinde 10 sn sar
        case 'ArrowRight':
          if (currentItem.isLive) onNext?.()
          else video.currentTime = Math.min(video.duration || 0, video.currentTime + 10)
          break
        case 'ArrowLeft':
          if (currentItem.isLive) onPrev?.()
          else video.currentTime = Math.max(0, video.currentTime - 10)
          break
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, mode, player, drawerOpen, drawer, onPrev, onNext, panelOpen, moreOpen, helpOpen, compact, liveMeta, picture.settings])

  // İzleme istatistikleri: oynarken 15 sn'de bir süre ekle
  useEffect(() => {
    if (!item) return
    const iv = setInterval(() => {
      const v = videoRef.current
      if (v && !v.paused && v.readyState >= 3) addWatchTime(item, 15)
    }, 15000)
    return () => clearInterval(iv)
  }, [item])

  // İnternetten indirilen altyazı: videoya <track> olarak eklenir
  useEffect(() => {
    setExternalSub(null)
    setSubOffset(0)
  }, [item?.url])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !externalSub) return
    const url = URL.createObjectURL(new Blob([externalSub.vtt], { type: 'text/vtt' }))
    const track = document.createElement('track')
    track.kind = 'subtitles'
    track.label = externalSub.label
    track.srclang = 'tr'
    track.src = url
    track.default = true
    video.appendChild(track)
    const show = (): void => {
      for (const t of Array.from(video.textTracks)) {
        t.mode = t.label === externalSub.label ? 'showing' : 'disabled'
      }
    }
    track.addEventListener('load', show)
    show()
    return () => {
      track.removeEventListener('load', show)
      track.remove()
      URL.revokeObjectURL(url)
    }
  }, [externalSub])

  function shiftExternalSub(seconds: number): void {
    const video = videoRef.current
    if (!video || !externalSub) return
    for (const t of Array.from(video.textTracks)) {
      if (t.label !== externalSub.label || !t.cues) continue
      for (const c of Array.from(t.cues)) {
        c.startTime = Math.max(0, c.startTime + seconds)
        c.endTime = Math.max(0, c.endTime + seconds)
      }
    }
    setSubOffset((o) => o + seconds)
  }

  function retry(): void {
    setError(null)
    setRetryTick((t) => t + 1)
  }

  function toggleFullscreen(): void {
    if (!wrapRef.current) return
    if (document.fullscreenElement) {
      void document.exitFullscreen()
    } else {
      void wrapRef.current.requestFullscreen()
    }
  }

  function togglePlay(): void {
    const video = videoRef.current
    if (!video) return
    if (video.paused) video.play().catch(() => {})
    else video.pause()
  }

  function toggleMute(): void {
    const video = videoRef.current
    if (!video) return
    video.muted = !video.muted
  }

  async function togglePip(): Promise<void> {
    const video = videoRef.current
    if (!video) return
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture()
      else await video.requestPictureInPicture()
    } catch {
      showToast({ status: 'error', error: 'Resim içinde resim bu yayında açılamadı.' })
    }
  }

  function onVolumeChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const video = videoRef.current
    if (!video) return
    const value = Number(e.target.value)
    video.volume = value
    video.muted = value === 0
  }

  function onSeek(e: React.ChangeEvent<HTMLInputElement>): void {
    const video = videoRef.current
    if (!video) return
    video.currentTime = Number(e.target.value)
  }

  function rewindBy(seconds: number): void {
    if (!item?.isLive || !player?.canRewind) return
    const behind = liveMeta.behind ?? 0
    const max = Math.max(0, (liveMeta.rewindable ?? 0) - 3)
    const target = Math.min(max, Math.round(behind + seconds))
    if (target <= behind + 1) {
      showToast({ status: 'error', error: 'Daha geriye gidilemiyor (en fazla ~2,5 dakika).' })
      return
    }
    setRewind({ url: item.url, back: target })
  }

  function goLive(): void {
    if (item) setRewind({ url: item.url, back: 0 })
  }

  function showToast(next: ToastState): void {
    setToast(next)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    if (next.status === 'done' || next.status === 'error') {
      toastTimer.current = setTimeout(() => setToast({ status: 'idle' }), 7000)
    }
  }

  async function saveClip(): Promise<void> {
    const video = videoRef.current
    if (!item || !player || !video || toast.status === 'saving') return
    showToast({ status: 'saving', label: 'Son 30 saniye kaydediliyor…' })
    let res: ClipResult
    try {
      if (!item.isLive) {
        res = await window.iptv.clips.saveVod(item.url, item.name, video.currentTime, 30)
      } else if (player.clipMode === 'proxy') {
        // Oynatıcı canlının biraz gerisinden gösterir; kesit ekranda görülen
        // anın son 30 saniyesi olsun diye bu gecikmeyi de gönderiyoruz.
        const b = video.buffered
        const latency =
          liveMeta.behind ?? (b.length ? Math.max(0, b.end(b.length - 1) - video.currentTime) : 0)
        res = await window.iptv.clips.saveLive(item.name, 30, latency)
      } else if (player.clipMode === 'hls') {
        const bytes = player.getHlsClip(30)
        res = bytes
          ? await window.iptv.clips.saveBuffer(bytes, item.name)
          : { ok: false, error: 'Kaydedilecek görüntü yok' }
      } else {
        res = { ok: false, error: 'Bu yayın için kesit alınamıyor.' }
      }
    } catch (err) {
      res = { ok: false, error: err instanceof Error ? err.message : 'Kesit kaydedilemedi' }
    }
    showToast(
      res.ok && res.path
        ? { status: 'done', path: res.path, label: 'Kesit kaydedildi' }
        : { status: 'error', error: res.error || 'Kesit kaydedilemedi' }
    )
  }

  // Videonun o anki karesini (görüntü ayarları uygulanmış haliyle) PNG olarak kaydet
  async function takeScreenshot(): Promise<void> {
    const video = videoRef.current
    if (!item || !video || !video.videoWidth) return
    let res: ClipResult
    try {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('canvas')
      const filter = pictureFilter(picture.settings)
      if (filter !== 'none') ctx.filter = filter
      ctx.drawImage(video, 0, 0)
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!blob) throw new Error('boş')
      res = await window.iptv.media.saveScreenshot(new Uint8Array(await blob.arrayBuffer()), item.name)
    } catch {
      // Kare okunamadıysa ekranda görünen video alanını yakala
      const r = video.getBoundingClientRect()
      res = await window.iptv.media.capturePage(
        { x: r.x, y: r.y, width: r.width, height: r.height },
        item.name
      )
    }
    showToast(
      res.ok && res.path
        ? { status: 'done', path: res.path, label: 'Ekran görüntüsü kaydedildi' }
        : { status: 'error', error: res.error || 'Ekran görüntüsü alınamadı' }
    )
  }

  const now = epg[0]
  const upcoming = epg.slice(1, 5)
  const nowProgress =
    now && now.end > now.start
      ? Math.min(100, Math.max(0, ((Date.now() - now.start) / (now.end - now.start)) * 100))
      : 0

  const showOverlay = controlsVisible || !isPlaying || panelOpen || moreOpen
  // Kenar bilgileri (başlık, EPG, istatistik) yan panelde alttaki bilgi
  // alanında gösteriliyor; video üzerine yalnızca tam ekran/tam sayfa/mini pencerede.
  const richOverlay = isFullscreen || mode === 'theater' || compact
  const stageStyle = { '--ar': aspect } as CSSProperties
  const videoStyle: CSSProperties = {
    filter: pictureFilter(picture.settings),
    objectFit: picture.settings.fit
  }
  const isBehindLive = !!item?.isLive && liveBack > 0
  const sleepMinutesLeft =
    sleepAt !== null ? Math.max(1, Math.ceil((sleepAt - clockNow) / 60000)) : null

  const statsChips =
    stats.width > 0 ? (
      <div className="stats-badge">
        <span>
          <b>
            {stats.width}×{stats.height}
          </b>
        </span>
        <span>
          <b>{stats.fps}</b> fps
        </span>
        {stats.bitrateKbps !== undefined && (
          <span>
            <b>{(stats.bitrateKbps / 1000).toFixed(1)}</b> Mbps
          </span>
        )}
        {stats.videoCodec && <span>{stats.videoCodec.split('.')[0].toUpperCase()}</span>}
      </div>
    ) : null

  const toastEl =
    toast.status !== 'idle' ? (
      <div className={`clip-toast clip-toast-${toast.status}`}>
        {toast.status === 'saving' && <span>{toast.label}</span>}
        {toast.status === 'done' && (
          <>
            <span>{toast.label}</span>
            <button onClick={() => window.iptv.shell.showItem(toast.path)}>Klasörde göster</button>
          </>
        )}
        {toast.status === 'error' && <span>{toast.error}</span>}
      </div>
    ) : null

  const liveBadge = item?.isLive ? (
    isBehindLive ? (
      <button className="live-badge live-badge-behind" onClick={goLive} title="Canlı yayına dön">
        −{formatTime(liveMeta.behind ?? liveBack)} · Canlıya dön
      </button>
    ) : (
      <span className="live-badge">
        <span className="live-dot" /> CANLI
      </span>
    )
  ) : null

  return (
    <div className={`player-pane mode-${mode}`}>
      <div className="player-stage" style={stageStyle}>
        <div
          className={`player-pane-video-wrap ${item && !showOverlay ? 'controls-hidden' : ''} ${drawerOpen && isFullscreen ? 'drawer-open' : ''}`}
          ref={wrapRef}
        >
          <video
            ref={videoRef}
            playsInline
            style={videoStyle}
            onClick={() => {
              if (mode === 'mini') onExpand?.()
              else if (panelOpen || moreOpen) {
                setPanelOpen(false)
                setMoreOpen(false)
              }
              else togglePlay()
            }}
            onDoubleClick={() => mode !== 'mini' && toggleFullscreen()}
          />

          {!item && (
            <div className="player-pane-idle">
              <div className="player-pane-idle-icon">
                <IconLiveTv size={30} />
              </div>
              <p>Bir kanal seçin</p>
            </div>
          )}

          {item && error && (
            <div className="player-error">
              <div className="player-error-row">
                <IconWarning size={16} />{' '}
                {blockedByRecording
                  ? `“${blockedByRecording}” kaydediliyor. Hesap tek bağlantılı olduğu için kayıt bitene kadar başka kanal açılamaz.`
                  : error}
              </div>
              {mode !== 'mini' && (
                <>
                  <p className="player-error-hint">
                    {retryIn !== null && retryIn > 0
                      ? `${retryIn} sn içinde tekrar denenecek (${retryCount + 1}. deneme)`
                      : 'Tekrar deneniyor…'}
                  </p>
                  <div className="player-error-actions">
                    <button className="btn-secondary" onClick={retry}>
                      <IconRefresh size={13} /> Şimdi Dene
                    </button>
                    {onNext && (
                      <button className="btn-secondary" onClick={onNext}>
                        Sonraki kanal <IconSkipNext size={13} />
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {item && !error && (conn === 'connecting' || conn === 'stalled' || conn === 'reconnecting') && (
            <div className={`conn-status conn-${conn}`}>
              <span className="conn-spinner" />
              {conn === 'connecting'
                ? item.isLive
                  ? 'Kanala bağlanılıyor…'
                  : 'Yükleniyor…'
                : conn === 'stalled'
                  ? 'Yayın takıldı, bekleniyor…'
                  : 'Bağlantı koptu, yeniden bağlanılıyor…'}
            </div>
          )}

          {item && mode === 'mini' && (
            <div className="mini-overlay">
              <span className="mini-title">{item.name}</span>
              <div className="topbar-spacer" />
              <button className="icon-btn" onClick={onExpand} title="Büyüt">
                <IconExpand size={13} />
              </button>
              <button className="icon-btn" onClick={onClose} title="Kapat">
                <IconClose size={13} />
              </button>
            </div>
          )}

          {item && !error && mode !== 'mini' && (
            <>
              <div
                className="player-topbar"
                style={{ opacity: showOverlay ? 1 : 0 }}
                title={compact ? 'Sürükleyerek taşı · Kenarından tutup boyutlandır' : undefined}
              >
                {mode === 'theater' && !compact && (
                  <button className="icon-btn" onClick={onClose} title="Geri (Esc)">
                    <IconArrowLeft size={15} />
                  </button>
                )}
                {richOverlay && (
                  <div>
                    <div className="player-title">{item.name}</div>
                    <div className="player-group">{item.group}</div>
                  </div>
                )}
                <div className="topbar-spacer" />
                {recording && (
                  <span className="rec-badge">
                    <span className="rec-dot" /> KAYIT
                  </span>
                )}
                {liveBadge}
                {richOverlay && !compact && statsChips}
              </div>

              <div className="player-bottom" style={{ opacity: showOverlay ? 1 : 0 }}>
                {richOverlay && !compact && item.isLive && now && (
                  <div className="epg-strip">
                    <div className="epg-now">
                      <span className="epg-label">Şimdi</span>
                      <strong>{now.title}</strong>
                      <div className="epg-progress">
                        <div className="epg-progress-fill" style={{ width: `${nowProgress}%` }} />
                      </div>
                    </div>
                    {upcoming[0] && (
                      <div className="epg-next">
                        <span className="epg-label">Sırada</span>
                        <span>{upcoming[0].title}</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="player-controls">
                  <div className="transport">
                    {onPrev && (
                      <button className="icon-btn" onClick={onPrev} title="Önceki kanal (←)">
                        <IconSkipPrev size={15} />
                      </button>
                    )}
                    <button
                      className="icon-btn transport-play"
                      onClick={togglePlay}
                      title={isPlaying ? 'Duraklat (Boşluk)' : 'Oynat (Boşluk)'}
                    >
                      {isPlaying ? <IconPause size={17} /> : <IconPlay size={17} />}
                    </button>
                    {onNext && (
                      <button className="icon-btn" onClick={onNext} title="Sonraki kanal (→)">
                        <IconSkipNext size={15} />
                      </button>
                    )}
                    {item.isLive && player?.canRewind && (
                      <button className="icon-btn" onClick={() => rewindBy(10)} title="10 sn geri sar (J)">
                        <IconRewind size={16} />
                      </button>
                    )}
                    {!item.isLive && item.nextEpisode && (
                      <button
                        className="icon-btn"
                        onClick={playNextEpisode}
                        title="Sonraki bölüm"
                      >
                        <IconSkipNext size={15} />
                      </button>
                    )}
                  </div>

                  {!item.isLive ? (
                    <>
                      <span className="time-label">{formatTime(currentTime)}</span>
                      <input
                        type="range"
                        className="seek-bar"
                        min={0}
                        max={duration || 0}
                        step={0.5}
                        value={currentTime}
                        onChange={onSeek}
                      />
                      <span className="time-label">{formatTime(duration)}</span>
                    </>
                  ) : (
                    <div className="controls-spacer" />
                  )}

                  <div className="volume-control">
                    <button className="icon-btn" onClick={toggleMute} title="Sesi kapat/aç (M)">
                      {isMuted || volume === 0 ? <IconMute size={15} /> : <IconVolume size={15} />}
                    </button>
                    <input
                      type="range"
                      className="volume-bar"
                      min={0}
                      max={1}
                      step={0.01}
                      value={isMuted ? 0 : volume}
                      onChange={onVolumeChange}
                    />
                  </div>

                  <button
                    className={`icon-btn ${panelOpen ? 'icon-btn-active' : ''}`}
                    onClick={() => {
                      setPanelOpen((v) => !v)
                      setMoreOpen(false)
                    }}
                    title={
                      item?.isLive
                        ? 'Ayarlar: görüntü, tampon (donma önleme), altyazı ve uyku zamanlayıcısı (G)'
                        : 'Ayarlar: görüntü, ses, altyazı ve uyku zamanlayıcısı (G)'
                    }
                  >
                    <IconSliders size={15} />
                  </button>

                  <div className="more-menu-wrap">
                    <button
                      className={`icon-btn ${moreOpen ? 'icon-btn-active' : ''}`}
                      onClick={() => {
                        setMoreOpen((v) => !v)
                        setPanelOpen(false)
                      }}
                      title="Diğer: kesit, ekran görüntüsü, kayıt, mini pencere…"
                    >
                      <IconMore size={15} />
                    </button>
                    {moreOpen && (
                      <div className="more-menu" onClick={(e) => e.stopPropagation()}>
                        <MoreItem
                          icon={<IconScissors size={14} />}
                          label="Son 30 saniyeyi kaydet"
                          kbd="C"
                          onClick={() => {
                            setMoreOpen(false)
                            void saveClip()
                          }}
                        />
                        <MoreItem
                          icon={<IconCamera size={14} />}
                          label="Ekran görüntüsü al"
                          kbd="S"
                          onClick={() => {
                            setMoreOpen(false)
                            void takeScreenshot()
                          }}
                        />
                        {item.isLive && onRecordToggle && (
                          <MoreItem
                            icon={recording ? <IconStop size={12} /> : <IconRecord size={14} />}
                            label={recording ? 'Kaydı durdur' : 'Bu programı kaydet'}
                            onClick={() => {
                              setMoreOpen(false)
                              onRecordToggle({ programTitle: now?.title, end: now?.end })
                            }}
                          />
                        )}
                        <MoreItem
                          icon={<IconPip size={14} />}
                          label="Resim içinde resim"
                          kbd="P"
                          onClick={() => {
                            setMoreOpen(false)
                            void togglePip()
                          }}
                        />
                        {item.isLive && onOpenMultiView && (
                          <MoreItem
                            icon={<IconGrid size={14} />}
                            label="Çoklu ekran (2–4 kanal)"
                            onClick={() => {
                              setMoreOpen(false)
                              onOpenMultiView()
                            }}
                          />
                        )}
                        {onToggleCompact && !isFullscreen && (
                          <MoreItem
                            icon={<IconMiniWindow size={14} />}
                            label={compact ? 'Normal pencereye dön' : 'Mini pencere (her zaman üstte)'}
                            kbd="W"
                            onClick={() => {
                              setMoreOpen(false)
                              onToggleCompact()
                            }}
                          />
                        )}
                        <MoreItem
                          icon={<IconKeyboard size={14} />}
                          label="Klavye kısayolları"
                          kbd="?"
                          onClick={() => {
                            setMoreOpen(false)
                            setHelpOpen(true)
                          }}
                        />
                      </div>
                    )}
                  </div>

                  {compact && onToggleCompact && (
                    <button
                      className="icon-btn icon-btn-active"
                      onClick={onToggleCompact}
                      title="Normal pencereye dön (W)"
                    >
                      <IconMiniWindow size={15} />
                    </button>
                  )}
                  {compact && window.iptv?.platform !== 'darwin' && (
                    // Windows/Linux'ta pencere artık çerçevesiz; mini pencerede üst
                    // çubuk (ve içindeki kapat düğmesi) gizlendiği için buraya da
                    // bir kapat düğmesi koyuyoruz, yoksa mini izlerken uygulamayı
                    // kapatmanın görünür bir yolu kalmıyor.
                    <button
                      className="icon-btn"
                      onClick={() => window.iptv.window.close()}
                      title="Uygulamayı kapat"
                    >
                      <IconClose size={15} />
                    </button>
                  )}

                  {drawer && isFullscreen && (
                    <button
                      className={`icon-btn ${drawerOpen ? 'icon-btn-active' : ''}`}
                      onClick={() => setDrawerOpen((v) => !v)}
                      title="Kanal listesi (L)"
                    >
                      <IconChannels size={15} />
                    </button>
                  )}

                  {!compact && (
                    <button className="icon-btn" onClick={toggleFullscreen} title="Tam ekran (F)">
                      <IconExpand size={15} />
                    </button>
                  )}
                </div>
              </div>

              {richOverlay && toastEl}
            </>
          )}

          {item && panelOpen && mode !== 'mini' && (
            <PlayerSettingsPanel
              isLive={item.isLive}
              picture={picture}
              speed={speed}
              onSpeedChange={setSpeed}
              leveling={leveling}
              onLevelingChange={setLeveling}
              sleepMinutesLeft={sleepMinutesLeft}
              onSleepChange={(m) => {
                setClockNow(Date.now())
                setSleepAt(m === null ? null : Date.now() + m * 60000)
              }}
              bufferMode={bufferMode}
              onBufferModeChange={(m) => {
                setBufferMode(m)
                setBufferModeState(m)
              }}
              bufferSec={liveMeta.behind}
              subtitleContent={
                <SubtitleTab
                  item={item}
                  audioTracks={audioTracks}
                  subtitleTracks={subtitleTracks}
                  currentAudio={currentAudio}
                  currentSubtitle={currentSubtitle}
                  onAudio={(id) => {
                    player?.setAudioTrack(id)
                    setCurrentAudio(id)
                  }}
                  onSubtitle={(id) => {
                    player?.setSubtitleTrack(id)
                    setCurrentSubtitle(id)
                  }}
                  external={externalSub}
                  offset={subOffset}
                  onLoadExternal={(sub) => {
                    setSubOffset(0)
                    setExternalSub(sub)
                  }}
                  onShift={shiftExternalSub}
                  onClearExternal={() => setExternalSub(null)}
                />
              }
              onClose={() => setPanelOpen(false)}
            />
          )}

          {item && showNext && item.nextEpisode && mode !== 'mini' && (
            <div className="next-episode-card">
              <div className="next-episode-kicker">
                Sıradaki bölüm{countdown !== null ? ` · ${Math.max(0, countdown)} sn` : ''}
              </div>
              <div className="next-episode-title">
                S{item.nextEpisode.season} B{item.nextEpisode.episodeNum} ·{' '}
                {item.nextEpisode.name.replace(`${item.nextEpisode.seriesName} · `, '')}
              </div>
              <div className="next-episode-actions">
                <button className="btn-primary btn-sm" onClick={playNextEpisode}>
                  <IconPlay size={12} /> Şimdi oynat
                </button>
                <button className="btn-secondary btn-sm" onClick={() => setNextDismissedFor(item.id)}>
                  İptal
                </button>
              </div>
            </div>
          )}

          {item && drawer && drawerOpen && isFullscreen && (
            <ChannelDrawer data={drawer} selectedId={item.id} onClose={() => setDrawerOpen(false)} />
          )}

          {helpOpen && <ShortcutHelp onClose={() => setHelpOpen(false)} />}
        </div>
      </div>

      {mode === 'docked' && item && !compact && (
        <div className="player-info">
          <div className="player-info-head">
            <div className="player-info-logo">
              {item.logo ? (
                <img src={item.logo} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />
              ) : (
                <IconLiveTv size={18} />
              )}
            </div>
            <div className="player-info-titles">
              <div className="player-info-name">{item.name}</div>
              <div className="player-info-group">{item.group}</div>
            </div>
            <div className="topbar-spacer" />
            {onToggleFavorite && item.isLive && (
              <button
                className={`btn-secondary btn-sm ${isFavorite ? 'is-favorite' : ''}`}
                onClick={onToggleFavorite}
              >
                <IconStar size={13} filled={isFavorite} /> {isFavorite ? 'Favoride' : 'Favori'}
              </button>
            )}
            <button
              className="btn-secondary btn-sm"
              onClick={() => void saveClip()}
              disabled={toast.status === 'saving'}
            >
              <IconScissors size={13} /> Son 30 sn'yi kaydet
            </button>
            {item.isLive && onRecordToggle && (
              <button
                className={`btn-secondary btn-sm ${recording ? 'is-recording' : ''}`}
                onClick={() => onRecordToggle({ programTitle: now?.title, end: now?.end })}
                title={
                  recording
                    ? 'Kaydı durdur'
                    : now
                      ? `“${now.title}” bitene kadar kaydet`
                      : 'Bu kanalı 1 saat kaydet'
                }
              >
                {recording ? (
                  <>
                    <IconStop size={11} /> Kaydı durdur
                  </>
                ) : (
                  <>
                    <IconRecord size={12} /> Kaydet
                  </>
                )}
              </button>
            )}
          </div>

          {toastEl}

          {item.isLive && now && (
            <div className="player-info-now">
              <div className="player-info-now-meta">
                <span className="epg-chip">ŞİMDİ</span>
                <span className="player-info-time">
                  {formatClock(now.start)} – {formatClock(now.end)}
                </span>
              </div>
              <div className="player-info-now-title">{now.title}</div>
              <div className="info-progress">
                <div className="info-progress-fill" style={{ width: `${nowProgress}%` }} />
              </div>
              {now.description && <p className="player-info-desc">{now.description}</p>}
            </div>
          )}

          {item.isLive && upcoming.length > 0 && (
            <div className="player-info-upcoming">
              <div className="player-info-section-title">Sırada</div>
              {upcoming.map((p, i) => (
                <div className="upcoming-row" key={i}>
                  <span className="upcoming-time">{formatClock(p.start)}</span>
                  <span className="upcoming-title">{p.title}</span>
                </div>
              ))}
            </div>
          )}

          {item.isLive && !now && source?.type === 'xtream' && (
            <p className="player-info-desc">Bu kanal için program bilgisi yok.</p>
          )}

          {!item.isLive && duration > 0 && (
            <div className="player-info-now">
              <div className="player-info-time">
                {formatTime(currentTime)} / {formatTime(duration)}
              </div>
              <div className="info-progress">
                <div
                  className="info-progress-fill"
                  style={{ width: `${Math.min(100, (currentTime / duration) * 100)}%` }}
                />
              </div>
            </div>
          )}

          {statsChips && <div className="player-info-stats">{statsChips}</div>}
        </div>
      )}
    </div>
  )
}
