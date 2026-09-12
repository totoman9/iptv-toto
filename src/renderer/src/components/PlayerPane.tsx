import { useEffect, useRef, useState, type ReactElement } from 'react'
import type { EpgProgram, SourceConfig } from '../../../shared/types'
import { attachStream, type AttachedPlayer, type TrackInfo } from '../lib/playerEngine'
import { useStreamStats } from '../hooks/useStreamStats'
import { getShortEpg } from '../lib/xtream'
import { getProgress, saveProgress } from '../lib/continueWatching'
import {
  IconExpand,
  IconLiveTv,
  IconMute,
  IconPause,
  IconPlay,
  IconRefresh,
  IconSettings,
  IconVolume,
  IconWarning
} from './Icons'

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

export interface PlayableItem {
  id: string
  name: string
  group: string
  url: string
  streamId?: number
  isLive: boolean
}

interface Props {
  item: PlayableItem | null
  source: SourceConfig | null
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

export function PlayerPane({ item, source }: Props): ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [player, setPlayer] = useState<AttachedPlayer | null>(null)
  const [error, setError] = useState<string | null>(null)
  const errorRef = useRef<string | null>(null)
  const [epg, setEpg] = useState<EpgProgram[]>([])

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
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const resumedForUrl = useRef<string | null>(null)

  const stats = useStreamStats(videoRef, player)

  // Ses/altyazı parçaları yalnızca HLS (.m3u8) yayınlarında ve manifest
  // ayrıştırıldıktan bir süre sonra belli olur; birkaç saniye kısa aralıklarla
  // yoklayıp bulununca duruyoruz (sürekli yoklamaya gerek yok, akış boyunca
  // parça listesi değişmez).
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
    const video = videoRef.current
    if (!video || !item) return

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
  // Ayrı bir efekt olarak (yalnızca item.url'e bağlı, error/retryTick'e
  // değil) kuruluyor ki her yeniden denemede zamanlayıcı sıfırlanıp
  // baştan başlamasın.
  useEffect(() => {
    if (!item) return
    const timer = setInterval(() => {
      if (errorRef.current) retry()
    }, 5000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.url])

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
        const nearEnd = saved.positionSeconds >= video.duration * 0.95
        if (saved.positionSeconds > 5 && !nearEnd) {
          video.currentTime = saved.positionSeconds
        }
      })
    }
    video.addEventListener('loadedmetadata', onLoadedMeta)
    return () => video.removeEventListener('loadedmetadata', onLoadedMeta)
  }, [item])

  // İzleme konumunu belirli aralıklarla kaydet
  useEffect(() => {
    const video = videoRef.current
    if (!video || !item || item.isLive) return
    let lastSaved = 0
    const onTime = (): void => {
      const t = video.currentTime
      if (Math.abs(t - lastSaved) < 8 || !video.duration) return
      lastSaved = t
      saveProgress({
        id: item.id,
        title: item.name,
        positionSeconds: t,
        durationSeconds: video.duration,
        updatedAt: Date.now()
      })
    }
    video.addEventListener('timeupdate', onTime)
    return () => {
      video.removeEventListener('timeupdate', onTime)
      // Ayrılırken son konumu da kaydet
      if (video.duration && video.currentTime > 5) {
        saveProgress({
          id: item.id,
          title: item.name,
          positionSeconds: video.currentTime,
          durationSeconds: video.duration,
          updatedAt: Date.now()
        })
      }
    }
  }, [item])

  // Video elementinin gerçek durumunu (oynatma/duraklatma/süre) dinle
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const onPlay = (): void => setIsPlaying(true)
    const onPause = (): void => setIsPlaying(false)
    const onTime = (): void => setCurrentTime(video.currentTime)
    const onDuration = (): void => setDuration(video.duration || 0)
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
    video.addEventListener('volumechange', onVolume)

    return () => {
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('timeupdate', onTime)
      video.removeEventListener('durationchange', onDuration)
      video.removeEventListener('loadedmetadata', onDuration)
      video.removeEventListener('volumechange', onVolume)
    }
  }, [item?.url])

  useEffect(() => {
    if (!item?.isLive || !source || source.type !== 'xtream' || item.streamId === undefined) {
      setEpg([])
      return
    }
    let cancelled = false
    getShortEpg(source, item.streamId).then((programs) => {
      if (!cancelled) setEpg(programs)
    })
    return () => {
      cancelled = true
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
    resetTimer()
    const el = wrapRef.current
    el?.addEventListener('mousemove', resetTimer)
    el?.addEventListener('mouseleave', () => isPlaying && setControlsVisible(false))
    return () => {
      el?.removeEventListener('mousemove', resetTimer)
      if (hideTimer.current) clearTimeout(hideTimer.current)
    }
  }, [isPlaying, item?.id])

  // Klavye kısayolları: boşluk=oynat/duraklat, yukarı/aşağı=ses, sol/sağ=sar
  // (yalnızca canlı olmayanlarda), m=sessiz, f=tam ekran. Bir yazı kutusuna
  // yazarken tetiklenmesin diye input/textarea/select odaktaysa yoksayılır.
  useEffect(() => {
    if (!item) return
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
        case 'ArrowUp':
          e.preventDefault()
          video.volume = Math.min(1, video.volume + 0.05)
          video.muted = false
          break
        case 'ArrowDown':
          e.preventDefault()
          video.volume = Math.max(0, video.volume - 0.05)
          break
        case 'ArrowRight':
          if (!currentItem.isLive)
            video.currentTime = Math.min(video.duration || 0, video.currentTime + 10)
          break
        case 'ArrowLeft':
          if (!currentItem.isLive) video.currentTime = Math.max(0, video.currentTime - 10)
          break
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item])

  function retry(): void {
    setError(null)
    setRetryTick((t) => t + 1)
  }

  const now = epg[0]
  const next = epg[1]
  const nowProgress =
    now && now.end > now.start
      ? Math.min(100, Math.max(0, ((Date.now() - now.start) / (now.end - now.start)) * 100))
      : 0

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

  const showBottomBar = controlsVisible || !isPlaying

  return (
    <div className="player-pane">
      <div className="player-pane-video-wrap" ref={wrapRef}>
        <video ref={videoRef} autoPlay playsInline onClick={togglePlay} />

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
            <p className="player-error-hint">5 saniyede bir otomatik yeniden deneniyor…</p>
            <button className="btn-secondary" onClick={retry}>
              <IconRefresh size={13} /> Şimdi Dene
            </button>
          </div>
        )}

        {item && !error && (
          <>
            <div
              className="player-topbar"
              style={{ opacity: showBottomBar ? 1 : 0, transition: 'opacity 0.25s' }}
            >
              <div>
                <div className="player-title">{item.name}</div>
                <div className="player-group">{item.group}</div>
              </div>
              <div className="topbar-spacer" />
              {item.isLive && (
                <span className="live-badge">
                  <span className="live-dot" /> CANLI
                </span>
              )}
              {stats.width > 0 && (
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
                  {stats.videoCodec && (
                    <span>{stats.videoCodec.split('.')[0].toUpperCase()}</span>
                  )}
                </div>
              )}
            </div>

            <div
              className="player-bottom"
              style={{ opacity: showBottomBar ? 1 : 0, transition: 'opacity 0.25s' }}
            >
              {item.isLive && now && (
                <div className="epg-strip">
                  <div className="epg-now">
                    <span className="epg-label">Şimdi</span>
                    <strong>{now.title}</strong>
                    <div className="epg-progress">
                      <div className="epg-progress-fill" style={{ width: `${nowProgress}%` }} />
                    </div>
                  </div>
                  {next && (
                    <div className="epg-next">
                      <span className="epg-label">Sırada</span>
                      <span>{next.title}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="player-controls">
                <button className="icon-btn" onClick={togglePlay} title={isPlaying ? 'Duraklat' : 'Oynat'}>
                  {isPlaying ? <IconPause size={15} /> : <IconPlay size={15} />}
                </button>

                {!item.isLive && (
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
                )}

                {item.isLive && <div className="controls-spacer" />}

                <div className="volume-control">
                  <button className="icon-btn" onClick={toggleMute} title="Sesi kapat/aç">
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

                <button className="icon-btn" onClick={toggleFullscreen} title="Tam ekran">
                  <IconExpand size={15} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
