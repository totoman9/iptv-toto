import { useEffect, useRef, useState, type ReactElement } from 'react'
import type { EpgProgram, SourceConfig } from '../../../shared/types'
import { attachStream, type AttachedPlayer } from '../lib/playerEngine'
import { useStreamStats } from '../hooks/useStreamStats'
import { getShortEpg } from '../lib/xtream'
import { IconExpand, IconLiveTv, IconWarning } from './Icons'

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

export function PlayerPane({ item, source }: Props): ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [player, setPlayer] = useState<AttachedPlayer | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [epg, setEpg] = useState<EpgProgram[]>([])

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

  return (
    <div className="player-pane">
      <div className="player-pane-video-wrap" ref={wrapRef}>
        <video ref={videoRef} autoPlay playsInline controls={!!item && !item.isLive} />

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
            <div className="player-topbar">
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
              <button className="icon-btn" onClick={toggleFullscreen} title="Tam ekran">
                <IconExpand size={15} />
              </button>
            </div>

            {item.isLive && now && (
              <div className="player-bottom">
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
          </>
        )}
      </div>
    </div>
  )
}
