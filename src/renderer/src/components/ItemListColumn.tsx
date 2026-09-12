import { useMemo, useState, type ReactElement, type ReactNode } from 'react'
import { List, type RowComponentProps } from 'react-window'
import { ALL_GROUP } from './CategoryColumn'
import { IconSearch, IconStar } from './Icons'

export interface ListableItem {
  id: string
  name: string
  logo?: string
  group: string
}

interface RowProps {
  rows: ListableItem[]
  selectedId?: string
  onSelect: (item: ListableItem) => void
  favoriteIds?: Set<string>
  onToggleFavorite?: (id: string) => void
}

function Row({
  index,
  style,
  rows,
  selectedId,
  onSelect,
  favoriteIds,
  onToggleFavorite
}: RowComponentProps<RowProps>): ReactElement {
  const item = rows[index]
  return (
    <div
      style={style}
      className={`channel-row ${selectedId === item.id ? 'active' : ''}`}
      onClick={() => onSelect(item)}
    >
      <div className="channel-row-logo">
        {item.logo ? (
          <img src={item.logo} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />
        ) : (
          <span>{item.name.slice(0, 2).toUpperCase()}</span>
        )}
      </div>
      <span className="channel-row-name">{item.name}</span>
      {favoriteIds && onToggleFavorite && (
        <button
          className={`channel-row-fav ${favoriteIds.has(item.id) ? 'active' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            onToggleFavorite(item.id)
          }}
          title="Favorilere ekle / çıkar"
        >
          <IconStar size={13} filled={favoriteIds.has(item.id)} />
        </button>
      )}
    </div>
  )
}

interface Props {
  items: ListableItem[]
  activeGroup: string
  selectedId?: string
  onSelect: (item: ListableItem) => void
  favoriteIds?: Set<string>
  onToggleFavorite?: (id: string) => void
  emptyTitle: string
  emptyHint: string
  headerAction?: ReactNode
}

export function ItemListColumn({
  items,
  activeGroup,
  selectedId,
  onSelect,
  favoriteIds,
  onToggleFavorite,
  emptyTitle,
  emptyHint,
  headerAction
}: Props): ReactElement {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr')
    return items.filter((item) => {
      const matchesGroup = activeGroup === ALL_GROUP || item.group === activeGroup
      const matchesSearch = !q || item.name.toLocaleLowerCase('tr').includes(q)
      return matchesGroup && matchesSearch
    })
  }, [items, activeGroup, search])

  return (
    <div className="pane pane-items">
      <div className="pane-search-row">
        <div className="pane-search">
          <IconSearch size={14} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`${filtered.length} öğede ara`}
          />
        </div>
        {headerAction}
      </div>
      {filtered.length === 0 ? (
        <div className="empty-state empty-state-compact">
          <h3>{emptyTitle}</h3>
          <p>{emptyHint}</p>
        </div>
      ) : (
        <div className="pane-list">
          <List
            rowComponent={Row}
            rowCount={filtered.length}
            rowHeight={54}
            rowProps={{ rows: filtered, selectedId, onSelect, favoriteIds, onToggleFavorite }}
          />
        </div>
      )}
    </div>
  )
}
