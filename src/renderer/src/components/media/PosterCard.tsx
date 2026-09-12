import type { ReactElement } from 'react'
import { IconLock, IconPlay } from '../Icons'

export interface PosterCardData {
  id: string
  title: string
  subtitle?: string
  image?: string
  rating?: number
  // 0..1 — izleme ilerlemesi (kaldığın yer)
  progress?: number
  locked?: boolean
}

export function PosterCard({
  data,
  onClick
}: {
  data: PosterCardData
  onClick: () => void
}): ReactElement {
  return (
    <button className="poster-card" onClick={onClick} title={data.title}>
      <div className="poster-img">
        {data.image && !data.locked ? (
          <img
            src={data.image}
            alt=""
            loading="lazy"
            onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
          />
        ) : (
          <div className="poster-fallback">{data.title.slice(0, 2).toUpperCase()}</div>
        )}
        {data.locked && (
          <div className="poster-locked">
            <IconLock size={20} />
          </div>
        )}
        {data.rating && data.rating > 0 ? (
          <span className="poster-rating">★ {data.rating.toFixed(1)}</span>
        ) : null}
        <div className="poster-hover">
          <IconPlay size={22} />
        </div>
        {data.progress !== undefined && data.progress > 0 && (
          <div className="poster-progress">
            <div style={{ width: `${Math.max(3, Math.round(data.progress * 100))}%` }} />
          </div>
        )}
      </div>
      <div className="poster-title">{data.title}</div>
      {data.subtitle && <div className="poster-subtitle">{data.subtitle}</div>}
    </button>
  )
}
