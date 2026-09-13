import { useRef, type ReactElement } from 'react'
import { IconChevronRight } from '../Icons'
import { PosterCard, type PosterCardData } from './PosterCard'

// Detay sayfasının altındaki yatay afiş satırı ("Benzer içerikler")
export function SimilarRow({
  title,
  cards,
  onOpen
}: {
  title: string
  cards: PosterCardData[]
  onOpen: (id: string) => void
}): ReactElement | null {
  const ref = useRef<HTMLDivElement>(null)
  if (cards.length === 0) return null
  const scroll = (dir: 1 | -1): void => {
    const el = ref.current
    if (el) el.scrollBy({ left: dir * (el.clientWidth - 120), behavior: 'smooth' })
  }
  return (
    <div className="similar-row">
      <div className="media-row-head">
        <span className="media-row-title">{title}</span>
      </div>
      <div className="media-row-scroller-wrap">
        <button className="row-arrow row-arrow-left" onClick={() => scroll(-1)} title="Sola kaydır">
          <IconChevronRight size={18} style={{ transform: 'rotate(180deg)' }} />
        </button>
        <div className="media-row-scroller" ref={ref}>
          {cards.map((c) => (
            <PosterCard key={c.id} data={c} onClick={() => onOpen(c.id)} />
          ))}
        </div>
        <button className="row-arrow row-arrow-right" onClick={() => scroll(1)} title="Sağa kaydır">
          <IconChevronRight size={18} />
        </button>
      </div>
    </div>
  )
}
