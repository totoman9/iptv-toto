import { useEffect, useState, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { IconCheck, IconChevronRight, IconClose, IconPlay, IconPlus, IconThumbsUp } from '../Icons'
import { LandscapeArt, type PosterCardData } from './PosterCard'
import { useImdb } from '../../hooks/useImdb'
import { ImdbBadge } from './ImdbBadge'

// Netflix'teki "aşağı ok"a basınca açılan büyük önizleme kartı: küçük
// önizlemeden daha fazla bilgi (özet) ve buton içerir, ama tüm sezon/bölüm
// listesi ve benzer içerikler için hâlâ tam detay sayfasına yönlendirir.
export function QuickView({
  data,
  kind,
  genres,
  plot,
  durationText,
  loading,
  inList,
  canList,
  liked,
  playLabel,
  onPlay,
  onToggleList,
  onToggleLike,
  onOpenFull,
  onClose
}: {
  data: PosterCardData
  kind: 'movie' | 'series'
  genres?: string[]
  plot?: string
  durationText?: string
  loading: boolean
  inList: boolean
  canList: boolean
  liked: boolean
  playLabel: string
  onPlay: () => void
  onToggleList: () => void
  onToggleLike: () => void
  onOpenFull: () => void
  onClose: () => void
}): ReactElement {
  const imdb = useImdb([data.title], data.year, kind, true)
  const [imageBroken, setImageBroken] = useState(false)
  const [backdropBroken, setBackdropBroken] = useState(false)
  const image = data.image && !imageBroken ? data.image : undefined
  const backdrop = data.backdrop && !backdropBroken ? data.backdrop : undefined
  const tags = genres && genres.length ? genres.slice(0, 4) : undefined

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div className="quickview-backdrop" onClick={onClose}>
      <div className="quickview-card" onClick={(e) => e.stopPropagation()}>
        <button className="quickview-close" onClick={onClose} title="Kapat (Esc)">
          <IconClose size={16} />
        </button>
        <div className="quickview-art" onClick={onOpenFull} title="Tüm detaylar için tıkla">
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
          <div className={`quickview-title ${!backdrop && image ? 'has-side' : ''}`}>{data.title}</div>
        </div>
        <div className="quickview-body">
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
            <button className="btn-secondary btn-sm quickview-full-btn" onClick={onOpenFull}>
              Tüm detaylar <IconChevronRight size={13} />
            </button>
          </div>
          <div className="hp-meta">
            {data.isNew && <span className="hp-new">Yeni</span>}
            {data.rating && data.rating > 0 ? <span className="hp-rating">★ {data.rating.toFixed(1)}</span> : null}
            {data.year && <span className="hp-chip">{data.year}</span>}
            {durationText && <span>{durationText}</span>}
            {data.subtitle && data.subtitle !== data.year && <span>{data.subtitle}</span>}
          </div>
          {imdb.status !== 'idle' && imdb.status !== 'nokey' && (
            <div className="quickview-imdb">
              <ImdbBadge state={imdb} />
            </div>
          )}
          <p className="quickview-plot">
            {loading ? 'Yükleniyor…' : plot || 'Bu içerik için özet bilgisi yok.'}
          </p>
          {tags && <div className="hp-genres">{tags.join(' • ')}</div>}
        </div>
      </div>
    </div>,
    document.body
  )
}
