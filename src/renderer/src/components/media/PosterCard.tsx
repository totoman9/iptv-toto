import { useEffect, useRef, useState, type ReactElement } from 'react'
import type { PosterShape } from '../../lib/theme'
import { IconLock, IconPlay } from '../Icons'

export interface PosterCardData {
  id: string
  title: string
  subtitle?: string
  image?: string
  // Yatay kartlarda tercih edilen geniş görsel (varsa)
  backdrop?: string
  rating?: number
  // 0..1 — izleme ilerlemesi (kaldığın yer)
  progress?: number
  locked?: boolean
  // Sol üstte küçük etiket (ör. "3 yeni bölüm")
  badge?: string
  // Son bir haftada eklendi
  isNew?: boolean
  year?: string
  group?: string
}

export const cssUrl = (u: string): string => `url("${u.replace(/"/g, '%22')}")`

// Yatay alan için görsel: geniş görsel varsa o; yoksa dikey afişin bulanık
// hâli zemine, kendisi sağa (kırpılıp bozulmasın diye)
export function LandscapeArt({
  backdrop,
  image,
  onBackdropError,
  onImageError,
  onBackdropLoad,
  onImageLoad
}: {
  backdrop?: string
  image?: string
  onBackdropError?: () => void
  onImageError?: () => void
  onBackdropLoad?: () => void
  onImageLoad?: () => void
}): ReactElement | null {
  if (backdrop) return <img src={backdrop} alt="" loading="lazy" onError={onBackdropError} onLoad={onBackdropLoad} />
  if (!image) return null
  return (
    <>
      <div className="poster-land-blur" style={{ backgroundImage: cssUrl(image) }} />
      <img className="poster-land-side" src={image} alt="" loading="lazy" onError={onImageError} onLoad={onImageLoad} />
    </>
  )
}

// Netflix'teki gibi: fare kartın üzerinde biraz bekleyince büyüyen önizleme
// açılır. Kart yalnızca "şu kartın üzerinde beklendi / ayrılındı" bilgisini
// verir; önizlemenin kendisi MediaBrowser'da çizilir (bkz. HoverPreview).
const HOVER_DELAY_MS = 450

export function PosterCard({
  data,
  onClick,
  shape = 'portrait',
  onHoverStart,
  onHoverEnd
}: {
  data: PosterCardData
  onClick: () => void
  shape?: PosterShape
  onHoverStart?: (el: HTMLElement, data: PosterCardData) => void
  onHoverEnd?: () => void
}): ReactElement {
  // Görsel adresi var ama açılamadıysa (sağlayıcıda bozuk link) da düz siyah
  // kutu yerine yer tutucu gösterilsin
  const [imageBroken, setImageBroken] = useState(false)
  const [backdropBroken, setBackdropBroken] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const landscape = shape === 'landscape'
  const image = data.image && !imageBroken ? data.image : undefined
  const backdrop = landscape && data.backdrop && !backdropBroken ? data.backdrop : undefined
  const hasArt = !data.locked && !!(backdrop || image)

  // Bazı sağlayıcıların görsel sunucusu çok yavaş/erişilemez oluyor; tarayıcı
  // böyle bir görseli "bozuk" saymadan (onError hiç tetiklenmeden) çok uzun
  // süre bekleyebiliyor, kart boş/gri kalıyor. Birkaç saniyede yüklenmediyse
  // bozukmuş gibi davranıp temiz başlık kartına düşüyoruz.
  const loadedRef = useRef<{ backdrop?: string; image?: string }>({})
  useEffect(() => {
    if (!backdrop && !image) return
    const t = setTimeout(() => {
      if (backdrop && loadedRef.current.backdrop !== backdrop) setBackdropBroken(true)
      if (image && loadedRef.current.image !== image) setImageBroken(true)
    }, 4000)
    return () => clearTimeout(t)
  }, [backdrop, image])

  return (
    <button
      className={`poster-card shape-${shape}`}
      onClick={onClick}
      title={onHoverStart ? undefined : data.title}
      onMouseEnter={(e) => {
        if (!onHoverStart || data.locked) return
        const el = e.currentTarget
        timer.current = setTimeout(() => onHoverStart(el, data), HOVER_DELAY_MS)
      }}
      onMouseLeave={() => {
        if (timer.current) clearTimeout(timer.current)
        timer.current = null
        onHoverEnd?.()
      }}
    >
      <div className="poster-img">
        {!hasArt ? (
          <div className="poster-fallback">
            <span>{data.title}</span>
          </div>
        ) : landscape ? (
          <LandscapeArt
            backdrop={backdrop}
            image={image}
            onBackdropError={() => setBackdropBroken(true)}
            onImageError={() => setImageBroken(true)}
            onBackdropLoad={() => {
              loadedRef.current.backdrop = backdrop
            }}
            onImageLoad={() => {
              loadedRef.current.image = image
            }}
          />
        ) : (
          <img
            src={image}
            alt=""
            loading="lazy"
            onError={() => setImageBroken(true)}
            onLoad={() => {
              loadedRef.current.image = image
            }}
          />
        )}
        {data.locked && (
          <div className="poster-locked">
            <IconLock size={20} />
          </div>
        )}
        {data.badge ? (
          <span className="poster-badge">{data.badge}</span>
        ) : data.isNew ? (
          <span className="poster-badge poster-badge-new">Yeni eklendi</span>
        ) : null}
        {data.rating && data.rating > 0 ? (
          <span className="poster-rating">★ {data.rating.toFixed(1)}</span>
        ) : null}
        {landscape && !data.locked && (
          <div className={`poster-land-caption ${hasArt && !backdrop ? 'has-side' : ''}`}>
            <div className="poster-land-title">{data.title}</div>
            {data.subtitle && <div className="poster-land-sub">{data.subtitle}</div>}
          </div>
        )}
        <div className="poster-hover">
          <IconPlay size={22} />
        </div>
        {data.progress !== undefined && data.progress > 0 && (
          <div className="poster-progress">
            <div style={{ width: `${Math.max(3, Math.round(data.progress * 100))}%` }} />
          </div>
        )}
      </div>
      {!landscape && (
        <>
          <div className="poster-title">{data.title}</div>
          {data.subtitle && <div className="poster-subtitle">{data.subtitle}</div>}
        </>
      )}
    </button>
  )
}
