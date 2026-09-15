import { useEffect, useRef, type ReactElement, type ReactNode } from 'react'

export interface ContextMenuItem {
  label: string
  icon?: ReactNode
  onClick: () => void
  danger?: boolean
}

interface Props {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

// Kanal/film satırlarına sağ tıklayınca çıkan basit menü. Tıklanan noktaya
// yakın açılır, ekran dışına taşmasın diye kenarlardan geri çekilir.
export function ContextMenu({ x, y, items, onClose }: Props): ReactElement {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    // Aynı tıklamanın hemen kapatmasını önlemek için bir sonraki turda dinle
    const t = setTimeout(() => {
      document.addEventListener('mousedown', onDown)
      document.addEventListener('contextmenu', onDown)
    }, 0)
    document.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('contextmenu', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const menuWidth = 220
  const left = Math.min(x, window.innerWidth - menuWidth - 12)
  const top = Math.min(y, window.innerHeight - items.length * 36 - 24)

  return (
    <div className="context-menu" style={{ left, top }} ref={ref}>
      {items.map((item, i) => (
        <button
          key={i}
          className={`context-menu-item ${item.danger ? 'danger' : ''}`}
          onClick={() => {
            item.onClick()
            onClose()
          }}
        >
          {item.icon && <span className="context-menu-icon">{item.icon}</span>}
          {item.label}
        </button>
      ))}
    </div>
  )
}
