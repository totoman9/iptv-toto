import type { ComponentType, ReactElement } from 'react'
import type { SourceConfig } from '../../../shared/types'
import { IconLiveTv, IconMovie, IconPlus, IconRefresh, IconSeries, IconStar } from './Icons'

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

const TABS: { key: ViewKey; label: string; Icon: ComponentType<{ size?: number }> }[] = [
  { key: 'live', label: 'Canlı TV', Icon: IconLiveTv },
  { key: 'vod', label: 'Filmler', Icon: IconMovie },
  { key: 'series', label: 'Diziler', Icon: IconSeries },
  { key: 'favorites', label: 'Favoriler', Icon: IconStar }
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
        <div className="brand-mark">T</div>
        <span className="brand-name">IPTV Toto</span>
      </div>

      <div className="topnav-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={`topnav-tab ${view === tab.key ? 'active' : ''}`}
            onClick={() => onViewChange(tab.key)}
          >
            <tab.Icon size={16} /> {tab.label}
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

      <button
        className={`icon-btn ${loading ? 'icon-btn-spinning' : ''}`}
        onClick={onReload}
        title="Listeyi yenile"
      >
        <IconRefresh size={15} />
      </button>
      <button className="btn-primary topnav-add-btn" onClick={onAddSource}>
        <IconPlus size={14} /> Kaynak
      </button>
    </div>
  )
}
