import { useEffect, useRef, useState, type ReactElement } from 'react'
import type { EpgProgram, SourceConfig } from '../../../shared/types'
import { attachStream, type AttachedPlayer } from '../lib/playerEngine'
import { useStreamStats } from '../hooks/useStreamStats'
import { getShortEpg } from '../lib/xtream'

export interface PlayableItem {
  id: string
  name: string
  group: string
  url: string
  streamId?: number
  isLive: boolean
}

interface Props {
  item: PlayableItem
  source: SourceConfig | null
  onClose: () => void
}

export function PlayerOverlay({ item, source, onClose }: Props): ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [player, setPlayer] = useState<AttachedPlayer | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [epg, setEpg] = useState<EpgProgram[]>([])
  const [showControls, setShowControls] = useState(true)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stats = useStreamStats(videoRef, player)

  useEffect(() => {
    setError(null)
    const video = videoRef.current
    if (!video) return

    const attached = attachStream(video, item.url, (message) => setError(message))
    setPlayer(attached)

    return () => {
      attached.destroy()
      setPlayer(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.url])

  useEffect(() => {
    if (!item.isLive || !source || source.type !== 'xtream' || item.streamId === undefined) {
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
  }, [item.isLive, item.streamId, source])

  useEffect(() => {
    function resetTimer(): void {
      setShowControls(true)
      if (hideTimer.current) clearTimeout(hideTimer.current)
      hideTimer.current = setTimeout(() => setShowControls(false), 3500)
    }
    resetTimer()
    window.addEventListener('mousemove', resetTimer)
    return () => {
      window.removeEventListener('mousemove', resetTimer)
      if (hideTimer.current) clearTimeout(hideTimer.current)
    }
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const now = epg[0]
  const next = epg[1]
  const nowProgress =
    now && now.end > now.start
      ? Math.min(100, Math.max(0, ((Date.now() - now.start) / (now.end - now.start)) * 100))
      : 0

  return (
    <div className="player-overlay">
      <div className="player-video-wrap">
        <video ref={videoRef} autoPlay playsInline controls={!item.isLive} />

        {error && (
          <div className="player-error">
            <div>⚠️ {error}</div>
            <button className="btn-secondary" onClick={onClose}>
              Kapat
            </button>
          </div>
        )}

        <div className="player-topbar" style={{ opacity: showControls ? 1 : 0, transition: 'opacity 0.25s' }}>
          <button className="icon-btn" onClick={onClose} title="Kapat (Esc)">
            ✕
          </button>
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
              {stats.videoCodec && <span>{stats.videoCodec.split('.')[0].toUpperCase()}</span>}
            </div>
          )}
        </div>

        {item.isLive && now && (
          <div className="player-bottom" style={{ opacity: showControls ? 1 : 0, transition: 'opacity 0.25s' }}>
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
          </div>
        )}
      </div>
    </div>
  )
}
