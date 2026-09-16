import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { List, type RowComponentProps } from 'react-window'
import { cardHeight, cardWidth, type PosterShape, type PosterSize } from '../../lib/theme'
import { PosterCard, type PosterCardData } from './PosterCard'

const GAP = 18

export interface HoverHandlers {
  onHoverStart?: (el: HTMLElement, data: PosterCardData) => void
  onHoverEnd?: () => void
}

interface RowProps extends HoverHandlers {
  rows: PosterCardData[][]
  onOpen: (id: string) => void
  shape: PosterShape
}

function Row({
  index,
  style,
  rows,
  onOpen,
  shape,
  onHoverStart,
  onHoverEnd
}: RowComponentProps<RowProps>): ReactElement {
  return (
    <div style={style} className="poster-grid-row">
      {rows[index].map((d) => (
        <PosterCard
          key={d.id}
          data={d}
          shape={shape}
          onClick={() => onOpen(d.id)}
          onHoverStart={onHoverStart}
          onHoverEnd={onHoverEnd}
        />
      ))}
    </div>
  )
}

// Binlerce afişi tek seferde çizmemek için sanal ızgara: yalnızca ekranda
// görünen satırlar oluşturulur. Sütun sayısı alan genişliğine göre ayarlanır.
export function PosterGrid({
  items,
  onOpen,
  emptyText,
  shape = 'portrait',
  size = 'md',
  onHoverStart,
  onHoverEnd
}: {
  items: PosterCardData[]
  onOpen: (id: string) => void
  emptyText?: string
  shape?: PosterShape
  size?: PosterSize
} & HoverHandlers): ReactElement {
  const ref = useRef<HTMLDivElement>(null)
  const [cols, setCols] = useState(5)
  const cardW = cardWidth(size, shape)
  const rowHeight = cardHeight(size, shape) + (shape === 'landscape' ? 24 : 33)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = (): void => {
      const width = el.clientWidth - 30
      setCols(Math.max(1, Math.floor((width + GAP) / (cardW + GAP))))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [cardW])

  const rows = useMemo(() => {
    const out: PosterCardData[][] = []
    for (let i = 0; i < items.length; i += cols) out.push(items.slice(i, i + cols))
    return out
  }, [items, cols])

  return (
    <div className="poster-grid" ref={ref}>
      {items.length === 0 ? (
        <div className="empty-state empty-state-compact">
          <p>{emptyText || 'İçerik yok'}</p>
        </div>
      ) : (
        <List
          rowComponent={Row}
          rowCount={rows.length}
          rowHeight={rowHeight}
          overscanCount={2}
          rowProps={{ rows, onOpen, shape, onHoverStart, onHoverEnd }}
        />
      )}
    </div>
  )
}
