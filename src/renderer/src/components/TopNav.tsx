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
  onReload: () => void
  loading: boolean
}

const TABS: { key: ViewKey; label: string; icon: string }[] = [
  { key: 'live', label: 'Canlı TV', icon: '📡' },
  { key: 'vod', label: 'Filmler', icon: '🎬' },
  { key: 'series', label: 'Diziler', icon: '🎞️' },
  { key: 'favorites', label: 'Favoriler', icon: '★' }
]

export function TopNav({
  view,
  onViewChange,
  sources,
  activeSourceId,
  onSourceChange,
  onAddSource,
  onReload,
  loading
}: Props): ReactElement {
  return (
    <div className="topnav">
      <div className="topnav-brand">
        <div className="brand-mark">IP</div>
        <span className="brand-name">IPTV Stüdyo</span>
      </div>

      <div className="topnav-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={`topnav-tab ${view === tab.key ? 'active' : ''}`}
            onClick={() => onViewChange(tab.key)}
          >
            <span>{tab.icon}</span> {tab.label}
          </button>
        ))}
      </div>

      <div className="topnav-spacer" />

      {sources.length > 0 && (
        <select
          className="source-select topnav-source-select"
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

      <button className="icon-btn" onClick={onReload} title="Listeyi yenile">
        {loading ? '…' : '⟳'}
      </button>
      <button className="btn-primary topnav-add-btn" onClick={onAddSource}>
        + Kaynak
      </button>
    </div>
  )
}
