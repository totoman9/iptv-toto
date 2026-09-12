import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { List, type RowComponentProps } from 'react-window'
import { PosterCard, type PosterCardData } from './PosterCard'

const CARD_W = 150
const GAP = 18
const ROW_H = 306

interface RowProps {
  rows: PosterCardData[][]
  onOpen: (id: string) => void
}

function Row({ index, style, rows, onOpen }: RowComponentProps<RowProps>): ReactElement {
  return (
    <div style={style} className="poster-grid-row">
      {rows[index].map((d) => (
        <PosterCard key={d.id} data={d} onClick={() => onOpen(d.id)} />
      ))}
    </div>
  )
}

// Binlerce afişi tek seferde çizmemek için sanal ızgara: yalnızca ekranda
// görünen satırlar oluşturulur. Sütun sayısı alan genişliğine göre ayarlanır.
export function PosterGrid({
  items,
  onOpen,
  emptyText
}: {
  items: PosterCardData[]
  onOpen: (id: string) => void
  emptyText?: string
}): ReactElement {
  const ref = useRef<HTMLDivElement>(null)
  const [cols, setCols] = useState(5)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = (): void => {
      const width = el.clientWidth - 30
      setCols(Math.max(1, Math.floor((width + GAP) / (CARD_W + GAP))))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

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
        <List rowComponent={Row} rowCount={rows.length} rowHeight={ROW_H} rowProps={{ rows, onOpen }} />
      )}
    </div>
  )
}
