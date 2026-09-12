import { useEffect, useRef, useState, type ReactElement } from 'react'
import type { EpgProgram, SourceConfig } from '../../../shared/types'
import { attachStream, type AttachedPlayer } from '../lib/playerEngine'
import { useStreamStats } from '../hooks/useStreamStats'
import { getShortEpg } from '../lib/xtream'
import {
  IconExpand,
  IconLiveTv,
  IconMute,
  IconPause,
  IconPlay,
  IconVolume,
  IconWarning
} from './Icons'

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
  const [epg, setEpg] = useState<EpgProgram[]>([])

  const [isPlaying, setIsPlaying] = useState(true)
  const [isMuted, setIsMuted] = useState(false)
  const [volume, setVolume] = useState(1)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [controlsVisible, setControlsVisible] = useState(true)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stats = useStreamStats(videoRef, player)

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
  }, [item?.url])

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
