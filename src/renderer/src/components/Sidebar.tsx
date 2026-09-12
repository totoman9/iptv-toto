import type { ReactElement } from 'react'
import type { SourceConfig } from '../../../shared/types'

export type ViewKey = 'live' | 'vod' | 'series' | 'favorites'

interface Props {
  view: ViewKey
  onViewChange: (v: ViewKey) => void
  sources: SourceConfig[]
  activeSourceId: string | null
  onSourceChange: (id: string) => void
  onAddSource: () => void
}

const NAV_ITEMS: { key: ViewKey; label: string; icon: string }[] = [
  { key: 'live', label: 'Canlı TV', icon: '📡' },
  { key: 'vod', label: 'Filmler', icon: '🎬' },
  { key: 'series', label: 'Diziler', icon: '🎞️' },
  { key: 'favorites', label: 'Favoriler', icon: '★' }
]

export function Sidebar({
  view,
  onViewChange,
  sources,
  activeSourceId,
  onSourceChange,
  onAddSource
}: Props): ReactElement {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">IP</div>
        <div className="brand-name">IPTV Stüdyo</div>
      </div>

      <nav className="nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            className={`nav-item ${view === item.key ? 'active' : ''}`}
            onClick={() => onViewChange(item.key)}
          >
            <span className="nav-icon">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      <div className="nav-spacer" />

      <div className="source-picker">
        <div className="source-label">Aktif Kaynak</div>
        {sources.length > 0 && (
          <select
            className="source-select"
            value={activeSourceId || ''}
            onChange={(e) => onSourceChange(e.target.value)}
          >
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
        <button className="btn-add-source" onClick={onAddSource}>
          + Yeni Kaynak Ekle
        </button>
      </div>
    </aside>
  )
}
