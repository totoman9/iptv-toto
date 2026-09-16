import { useState, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import type { PosterShape } from '../../lib/theme'
import { IconCheck, IconChevronDown, IconPlay, IconPlus, IconThumbsUp } from '../Icons'
import { LandscapeArt, type PosterCardData } from './PosterCard'

export interface HoverTarget {
  data: PosterCardData
  rect: DOMRect
  shape: PosterShape
  onOpen: (id: string) => void
}

const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v))

// Netflix tarzı önizleme: kartın üzerinde beklenince kartın yerinde büyüyerek
// açılır; görsel, puan/yıl/tür ve Oynat / Listeme ekle / Detay düğmeleri.
export function HoverPreview({
  target,
  genres,
  durationText,
  inList,
  canList,
  liked,
  playLabel,
  onPlay,
  onToggleList,
  onToggleLike,
  onInfo,
  onEnter,
  onLeave
}: {
  target: HoverTarget
  genres?: string[]
  durationText?: string
  inList: boolean
  canList: boolean
  liked: boolean
  playLabel: string
  onPlay: () => void
  onToggleList: () => void
  onToggleLike: () => void
  onInfo: () => void
  onEnter: () => void
  onLeave: () => void
}): ReactElement {
  const { data, rect, shape } = target
  const [imageBroken, setImageBroken] = useState(false)
  const [backdropBroken, setBackdropBroken] = useState(false)

  const width = clamp(rect.width * 1.5, 300, 440)
  const imgH = (width * 9) / 16
  const estHeight = imgH + 140
  const cardImgH = shape === 'landscape' ? rect.height : rect.width * 1.5
  const centerX = rect.left + rect.width / 2
  const centerY = rect.top + cardImgH / 2
  const left = clamp(centerX - width / 2, 12, window.innerWidth - width - 12)
  const top = clamp(centerY - imgH / 2 - 8, 12, window.innerHeight - estHeight - 12)

  const image = data.image && !imageBroken ? data.image : undefined
  const backdrop = data.backdrop && !backdropBroken ? data.backdrop : undefined
  const tags = (genres && genres.length ? genres.slice(0, 3) : [data.group]).filter(Boolean)

  return createPortal(
    <div
      className="hover-preview"
      style={{ left, top, width, transformOrigin: `${centerX - left}px ${centerY - top}px` }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <div className="hover-preview-art" onClick={onInfo}>
        {backdrop || image ? (
          <LandscapeArt
            backdrop={backdrop}
            image={image}
            onBackdropError={() => setBackdropBroken(true)}
            onImageError={() => setImageBroken(true)}
          />
        ) : (
          <div className="poster-fallback">
            <span>{data.title}</span>
          </div>
        )}
        <div className={`hover-preview-title ${!backdrop && image ? 'has-side' : ''}`}>{data.title}</div>
        {data.progress !== undefined && data.progress > 0 && (
          <div className="hover-preview-progress">
            <div style={{ width: `${Math.max(3, Math.round(data.progress * 100))}%` }} />
          </div>
        )}
      </div>
      <div className="hover-preview-body">
        <div className="hp-actions">
          <button className="hp-btn hp-btn-play" onClick={onPlay} title={playLabel}>
            <IconPlay size={16} />
          </button>
          {canList && (
            <button
              className="hp-btn"
              onClick={onToggleList}
              title={inList ? 'İzleme listemden çıkar' : 'İzleme listeme ekle'}
            >
              {inList ? <IconCheck size={16} /> : <IconPlus size={16} />}
            </button>
          )}
          {canList && (
            <button
              className={`hp-btn ${liked ? 'hp-btn-liked' : ''}`}
              onClick={onToggleLike}
              title={liked ? 'Beğenmekten vazgeç' : 'Beğendim'}
            >
              <IconThumbsUp size={15} filled={liked} />
            </button>
          )}
          <button className="hp-btn hp-btn-more" onClick={onInfo} title="Genişlet: detaylar ve bölümler">
            <IconChevronDown size={16} />
          </button>
        </div>
        <div className="hp-meta">
          {data.isNew && <span className="hp-new">Yeni</span>}
          {data.rating && data.rating > 0 ? <span className="hp-rating">★ {data.rating.toFixed(1)}</span> : null}
          {data.year && <span className="hp-chip">{data.year}</span>}
          {durationText && <span>{durationText}</span>}
          {data.subtitle && data.subtitle !== data.year && <span>{data.subtitle}</span>}
        </div>
        {tags.length > 0 && <div className="hp-genres">{tags.join(' • ')}</div>}
      </div>
    </div>,
    document.body
  )
}
