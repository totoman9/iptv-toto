import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react'
import type { ClipResult, EpgProgram, PlayableItem, SourceConfig } from '../../../shared/types'
import { attachStream, type AttachedPlayer, type TrackInfo } from '../lib/playerEngine'
import { ChannelDrawer, type ChannelDrawerData } from './ChannelDrawer'
import { useStreamStats } from '../hooks/useStreamStats'
import { getShortEpg } from '../lib/xtream'
import { getProgress, saveProgress } from '../lib/continueWatching'
import {
  IconArrowLeft,
  IconChannels,
  IconClose,
  IconExpand,
  IconLiveTv,
  IconMute,
  IconPause,
  IconPlay,
  IconRefresh,
  IconScissors,
  IconSettings,
  IconSkipNext,
  IconSkipPrev,
  IconStar,
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
}

const VOLUME_STORAGE_KEY = 'iptv-toto-volume'

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

type ClipState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'done'; path: string }
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
  drawer
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
  const [tracksMenuOpen, setTracksMenuOpen] = useState(false)
  const [clip, setClip] = useState<ClipState>({ status: 'idle' })
  const [drawerOpen, setDrawerOpen] = useState(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clipTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const resumedForUrl = useRef<string | null>(null)

  const stats = useStreamStats(videoRef, player)

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
    setClip({ status: 'idle' })
    const video = videoRef.current
    if (!video || !item) {
      if (video) video.removeAttribute('src')
      return
    }

    const attached = attachStream(video, item.url, (message) => setError(message))
    setPlayer(attached)

    return () => {
      attached.destroy()
      setPlayer(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.url, retryTick])

  useEffect(() => {
    errorRef.current = error
  }, [error])

  // Bağlantı hatası varsa 5 saniyede bir otomatik olarak tekrar dener.
  useEffect(() => {
    if (!item) return
    const timer = setInterval(() => {
      if (errorRef.current) retry()
    }, 5000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.url])

  // Ses/altyazı parçaları yalnızca HLS (.m3u8) yayınlarında ve manifest
  // ayrıştırıldıktan bir süre sonra belli olur; birkaç saniye yoklayıp duruyoruz.
  useEffect(() => {
    setAudioTracks([])
    setSubtitleTracks([])
    setTracksMenuOpen(false)
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
    if (!video || !item || item.isLive) return
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
    }
  }, [item?.url])

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
      getShortEpg(source, item.streamId!, 6).then((programs) => {
        if (!cancelled) setEpg(programs.filter((p) => p.end > Date.now()))
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

  // Kontrolleri fare hareketsizken otomatik gizle (oynatılırken)
  useEffect(() => {
    function resetTimer(): void {
      setControlsVisible(true)
      if (hideTimer.current) clearTimeout(hideTimer.current)
      if (isPlaying) {
        hideTimer.current = setTimeout(() => setControlsVisible(false), 3200)
      }
    }
    const onLeave = (): void => {
      if (isPlaying) setControlsVisible(false)
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
  }, [isPlaying, item?.id])

  // Klavye kısayolları: boşluk/k=oynat-duraklat, yukarı/aşağı=ses, sol/sağ=sar
  // (canlı olmayanlarda), m=sessiz, f=tam ekran, c=son 30 sn'yi kaydet.
  // Mini moddayken (film/dizi ekranında gezinirken) kısayollar devre dışı.
  useEffect(() => {
    if (!item || mode === 'mini') return
    const currentItem = item

    function isTypingTarget(el: EventTarget | null): boolean {
      if (!(el instanceof HTMLElement)) return false
      return ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable
    }

    function onKeyDown(e: KeyboardEvent): void {
      if (isTypingTarget(e.target)) return
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
          saveClip()
          break
        case 'Escape':
          if (drawerOpen) setDrawerOpen(false)
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
  }, [item, mode, player, drawerOpen, drawer, onPrev, onNext])

  function retry(): void {
    setError(null)
    setRetryTick((t) => t + 1)
  }

  function toggleFullscreen(): void {
    if (!wrapRef.current) return
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      wrapRef.current.requestFullscreen()
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

  function showClipResult(next: ClipState): void {
    setClip(next)
    if (clipTimer.current) clearTimeout(clipTimer.current)
    if (next.status === 'done' || next.status === 'error') {
      clipTimer.current = setTimeout(() => setClip({ status: 'idle' }), 7000)
    }
  }

  async function saveClip(): Promise<void> {
    const video = videoRef.current
    if (!item || !player || !video || clip.status === 'saving') return
    showClipResult({ status: 'saving' })
    let res: ClipResult
    try {
      if (!item.isLive) {
        res = await window.iptv.clips.saveVod(item.url, item.name, video.currentTime, 30)
      } else if (player.clipMode === 'proxy') {
        // Oynatıcı canlının biraz gerisinden gösterir; kesit ekranda görülen
        // anın son 30 saniyesi olsun diye bu gecikmeyi de gönderiyoruz.
        const b = video.buffered
        const latency = b.length ? Math.max(0, b.end(b.length - 1) - video.currentTime) : 0
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
    showClipResult(
      res.ok && res.path
        ? { status: 'done', path: res.path }
        : { status: 'error', error: res.error || 'Kesit kaydedilemedi' }
    )
  }

  const now = epg[0]
  const upcoming = epg.slice(1, 5)
  const nowProgress =
    now && now.end > now.start
      ? Math.min(100, Math.max(0, ((Date.now() - now.start) / (now.end - now.start)) * 100))
      : 0

  const showOverlay = controlsVisible || !isPlaying
  // Kenar bilgileri (başlık, EPG, istatistik) yan panelde alttaki bilgi
  // alanında gösteriliyor; video üzerine yalnızca tam ekran/tam sayfa modunda.
  const richOverlay = isFullscreen || mode === 'theater'
  const stageStyle = { '--ar': aspect } as CSSProperties

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

  const clipToast =
    clip.status !== 'idle' ? (
      <div className={`clip-toast clip-toast-${clip.status}`}>
        {clip.status === 'saving' && <span>Son 30 saniye kaydediliyor…</span>}
        {clip.status === 'done' && (
          <>
            <span>Kesit kaydedildi</span>
            <button onClick={() => window.iptv.shell.showItem(clip.path)}>Klasörde göster</button>
          </>
        )}
        {clip.status === 'error' && <span>{clip.error}</span>}
      </div>
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
            onClick={() => (mode === 'mini' ? onExpand?.() : togglePlay())}
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
                <IconWarning size={16} /> {error}
              </div>
              {mode !== 'mini' && (
                <>
                  <p className="player-error-hint">5 saniyede bir otomatik yeniden deneniyor…</p>
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
              <div className="player-topbar" style={{ opacity: showOverlay ? 1 : 0 }}>
                {mode === 'theater' && (
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
                {item.isLive && (
                  <span className="live-badge">
                    <span className="live-dot" /> CANLI
                  </span>
                )}
                {richOverlay && statsChips}
              </div>

              <div className="player-bottom" style={{ opacity: showOverlay ? 1 : 0 }}>
                {richOverlay && item.isLive && now && (
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
                    className={`icon-btn ${clip.status === 'saving' ? 'icon-btn-busy' : ''}`}
                    onClick={saveClip}
                    title="Son 30 saniyeyi kaydet (C)"
                  >
                    <IconScissors size={15} />
                  </button>

                  {(audioTracks.length > 1 || subtitleTracks.length > 0) && (
                    <div className="tracks-menu-wrap">
                      <button
                        className="icon-btn"
                        onClick={() => setTracksMenuOpen((v) => !v)}
                        title="Ses / Altyazı"
                      >
                        <IconSettings size={15} />
                      </button>
                      {tracksMenuOpen && (
                        <div className="tracks-menu">
                          {audioTracks.length > 1 && (
                            <div className="tracks-menu-section">
                              <div className="tracks-menu-title">Ses</div>
                              {audioTracks.map((t) => (
                                <button
                                  key={t.id}
                                  className={`tracks-menu-item ${currentAudio === t.id ? 'active' : ''}`}
                                  onClick={() => {
                                    player?.setAudioTrack(t.id)
                                    setCurrentAudio(t.id)
                                  }}
                                >
                                  {t.label}
                                </button>
                              ))}
                            </div>
                          )}
                          {subtitleTracks.length > 0 && (
                            <div className="tracks-menu-section">
                              <div className="tracks-menu-title">Altyazı</div>
                              <button
                                className={`tracks-menu-item ${currentSubtitle === -1 ? 'active' : ''}`}
                                onClick={() => {
                                  player?.setSubtitleTrack(-1)
                                  setCurrentSubtitle(-1)
                                }}
                              >
                                Kapalı
                              </button>
                              {subtitleTracks.map((t) => (
                                <button
                                  key={t.id}
                                  className={`tracks-menu-item ${currentSubtitle === t.id ? 'active' : ''}`}
                                  onClick={() => {
                                    player?.setSubtitleTrack(t.id)
                                    setCurrentSubtitle(t.id)
                                  }}
                                >
                                  {t.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
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

                  <button className="icon-btn" onClick={toggleFullscreen} title="Tam ekran (F)">
                    <IconExpand size={15} />
                  </button>
                </div>
              </div>

              {richOverlay && clipToast}
            </>
          )}

          {item && drawer && drawerOpen && isFullscreen && (
            <ChannelDrawer data={drawer} selectedId={item.id} onClose={() => setDrawerOpen(false)} />
          )}
        </div>
      </div>

      {mode === 'docked' && item && (
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
            <button className="btn-secondary btn-sm" onClick={saveClip} disabled={clip.status === 'saving'}>
              <IconScissors size={13} /> Son 30 sn'yi kaydet
            </button>
          </div>

          {clipToast}

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
