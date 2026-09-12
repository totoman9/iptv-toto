import type { ReactElement } from 'react'

interface Props {
  title: string
  search: string
  onSearchChange: (v: string) => void
  onReload: () => void
  loading: boolean
}

export function TopBar({ title, search, onSearchChange, onReload, loading }: Props): ReactElement {
  return (
    <div className="topbar">
      <div className="topbar-title">{title}</div>
      <div className="topbar-spacer" />
      <div className="search-box">
        <span>🔍</span>
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Ara…"
        />
      </div>
      <button className="icon-btn" onClick={onReload} title="Listeyi yenile">
        {loading ? '…' : '⟳'}
      </button>
    </div>
  )
}
