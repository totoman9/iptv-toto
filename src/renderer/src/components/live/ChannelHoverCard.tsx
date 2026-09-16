import { useState, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import type { Channel } from '../../../../shared/types'
import type { ChannelMeta } from '../ItemListColumn'
import { IconLock, IconPlay, IconStar } from '../Icons'

export interface ChannelHoverTarget {
  channel: Channel
  rect: DOMRect
  meta?: ChannelMeta
}

const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v))

// Kanal kutucuğunun üzerinde beklenince açılan büyütülmüş önizleme —
// PosterCard'daki film/dizi önizlemesiyle aynı ruhta ama kanal bilgisiyle
// (şu an oynayan program, favori düğmesi).
export function ChannelHoverCard({
  target,
  isFavorite,
  isLocked,
  onPlay,
  onToggleFavorite
}: {
  target: ChannelHoverTarget
  isFavorite: boolean
  isLocked: boolean
  onPlay: () => void
  onToggleFavorite: () => void
}): ReactElement {
  const { channel, rect, meta } = target
  const [logoBroken, setLogoBroken] = useState(false)

  const width = clamp(rect.width * 1.6, 260, 360)
  const height = width * 0.66
  const centerX = rect.left + rect.width / 2
  const centerY = rect.top + rect.height / 2
  const left = clamp(centerX - width / 2, 12, window.innerWidth - width - 12)
  const top = clamp(centerY - height / 2, 12, window.innerHeight - height - 150)

  return createPortal(
    <div
      className="lv-hover"
      style={{ left, top, width, transformOrigin: `${centerX - left}px ${centerY - top}px` }}
    >
      <div className="lv-hover-art" onClick={onPlay}>
        {channel.logo && !logoBroken ? (
          <img src={channel.logo} alt="" onError={() => setLogoBroken(true)} />
        ) : (
          <span>{channel.name.slice(0, 2).toUpperCase()}</span>
        )}
        {isLocked && (
          <div className="poster-locked">
            <IconLock size={20} />
          </div>
        )}
      </div>
      <div className="lv-hover-body">
        <div className="lv-hover-name">{channel.name}</div>
        <div className="lv-hover-group">{channel.group}</div>
        {meta?.now && (
          <div className="lv-hover-now">
            <span className="lv-hover-now-title">{meta.now}</span>
            {meta.progress !== undefined && (
              <div className="info-progress lv-hover-progress">
                <div className="info-progress-fill" style={{ width: `${Math.round(meta.progress * 100)}%` }} />
              </div>
            )}
          </div>
        )}
        <div className="hp-actions">
          <button className="hp-btn hp-btn-play" onClick={onPlay} title="İzle">
            <IconPlay size={16} />
          </button>
          <button
            className={`hp-btn ${isFavorite ? 'hp-btn-liked' : ''}`}
            onClick={onToggleFavorite}
            title={isFavorite ? 'Favorilerden çıkar' : 'Favorilere ekle'}
          >
            <IconStar size={15} filled={isFavorite} />
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
