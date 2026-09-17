import { useEffect, useRef, useState, type ReactElement } from 'react'
import type { PosterShape } from '../../lib/theme'
import { isBadImage, markImageBad, markImageOk, remainingProbeMs } from '../../lib/badImages'
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

// Bir görselin "açılmıyor" sayılması için beklenen süre
export const PROBE_MS = 2500

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
  // Daha önce (bu ya da başka bir kartta) açılmadığı öğrenilen adresi hiç
  // denemiyoruz — böylece ikinci görüşte boş kutu hiç görünmüyor.
  const imageUsable = data.image && !imageBroken && !isBadImage(data.image)
  const backdropUsable = data.backdrop && !backdropBroken && !isBadImage(data.backdrop)
  const image = imageUsable ? data.image : undefined
  const backdrop = landscape && backdropUsable ? data.backdrop : undefined
  const hasArt = !data.locked && !!(backdrop || image)

  // Bazı sağlayıcıların görsel sunucusu çok yavaş/erişilemez oluyor; tarayıcı
  // böyle bir görseli "bozuk" saymadan (onError hiç tetiklenmeden) çok uzun
  // süre bekleyebiliyor, kart boş/gri kalıyor. Birkaç saniyede yüklenmediyse
  // bozukmuş gibi davranıp temiz başlık kartına düşüyoruz.
  const loadedRef = useRef<{ backdrop?: string; image?: string }>({})
  useEffect(() => {
    const url = backdrop || image
    if (!url) return
    const t = setTimeout(() => {
      if (backdrop && loadedRef.current.backdrop !== backdrop) failBackdrop(backdrop)
      if (image && loadedRef.current.image !== image) failImage(image)
    }, remainingProbeMs(url, PROBE_MS))
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backdrop, image])

  // Bozuk/açılmayan adresi yalnızca bu karta değil, uygulamanın tamamına
  // bildiriyoruz: sıralamalar (afişi olanlar önde) bunu öğrenip bu içeriği
  // listenin sonuna atıyor.
  function failImage(url?: string): void {
    markImageBad(url)
    setImageBroken(true)
  }
  function failBackdrop(url?: string): void {
    markImageBad(url)
    setBackdropBroken(true)
  }

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
            onBackdropError={() => failBackdrop(backdrop)}
            onImageError={() => failImage(image)}
            onBackdropLoad={() => {
              loadedRef.current.backdrop = backdrop
              markImageOk(backdrop)
            }}
            onImageLoad={() => {
              loadedRef.current.image = image
              markImageOk(image)
            }}
          />
        ) : (
          <img
            src={image}
            alt=""
            loading="lazy"
            onError={() => failImage(image)}
            onLoad={() => {
              loadedRef.current.image = image
              markImageOk(image)
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
