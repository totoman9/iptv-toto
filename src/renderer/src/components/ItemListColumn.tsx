import { useMemo, useState, type ReactElement, type ReactNode } from 'react'
import { List, type RowComponentProps } from 'react-window'
import { ALL_GROUP } from './CategoryColumn'
import { IconGrid, IconList, IconSearch, IconStar } from './Icons'
import { EmptyIllustration, type EmptyIllustrationKind } from './EmptyIllustration'

export type ListViewMode = 'list' | 'grid'

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
  renderRowExtra?: (item: ListableItem) => ReactNode
  onContextMenu?: (item: ListableItem, x: number, y: number) => void
  // Verilirse satırlar sürüklenip elle sıralanabilir (ör. favoriler listesi)
  onReorder?: (draggedId: string, targetId: string) => void
}

function FavButton({
  item,
  favoriteIds,
  onToggleFavorite
}: {
  item: ListableItem
  favoriteIds?: Set<string>
  onToggleFavorite?: (id: string) => void
}): ReactElement | null {
  if (!favoriteIds || !onToggleFavorite) return null
  return (
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
  )
}

function Row({
  index,
  style,
  rows,
  selectedId,
  onSelect,
  favoriteIds,
  onToggleFavorite,
  renderRowExtra,
  onContextMenu,
  onReorder
}: RowComponentProps<RowProps>): ReactElement {
  const item = rows[index]
  return (
    <div
      style={style}
      className={`channel-row ${selectedId === item.id ? 'active' : ''} ${onReorder ? 'is-reorderable' : ''}`}
      draggable={!!onReorder}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', item.id)
      }}
      onDragOver={(e) => {
        if (onReorder) e.preventDefault()
      }}
      onDrop={(e) => {
        if (!onReorder) return
        e.preventDefault()
        const draggedId = e.dataTransfer.getData('text/plain')
        if (draggedId) onReorder(draggedId, item.id)
      }}
      onClick={() => onSelect(item)}
      onContextMenu={(e) => {
        if (!onContextMenu) return
        e.preventDefault()
        onContextMenu(item, e.clientX, e.clientY)
      }}
    >
      <div className="channel-row-logo">
        {item.logo ? (
          <img src={item.logo} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />
        ) : (
          <span>{item.name.slice(0, 2).toUpperCase()}</span>
        )}
      </div>
      <span className="channel-row-name">{item.name}</span>
      {renderRowExtra?.(item)}
      <FavButton item={item} favoriteIds={favoriteIds} onToggleFavorite={onToggleFavorite} />
    </div>
  )
}

interface TileRowProps {
  tiles: ListableItem[][]
  selectedId?: string
  onSelect: (item: ListableItem) => void
  favoriteIds?: Set<string>
  onToggleFavorite?: (id: string) => void
  onContextMenu?: (item: ListableItem, x: number, y: number) => void
}

function TileRow({
  index,
  style,
  tiles,
  selectedId,
  onSelect,
  favoriteIds,
  onToggleFavorite,
  onContextMenu
}: RowComponentProps<TileRowProps>): ReactElement {
  return (
    <div style={style} className="tile-row">
      {tiles[index].map((item) => (
        <div
          key={item.id}
          className={`channel-tile ${selectedId === item.id ? 'active' : ''}`}
          onClick={() => onSelect(item)}
          onContextMenu={(e) => {
            if (!onContextMenu) return
            e.preventDefault()
            onContextMenu(item, e.clientX, e.clientY)
          }}
          title={item.name}
        >
          <FavButton item={item} favoriteIds={favoriteIds} onToggleFavorite={onToggleFavorite} />
          <div className="channel-tile-logo">
            {item.logo ? (
              <img src={item.logo} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />
            ) : (
              <span>{item.name.slice(0, 2).toUpperCase()}</span>
            )}
          </div>
          <span className="channel-tile-name">{item.name}</span>
        </div>
      ))}
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
  viewMode?: ListViewMode
  onViewModeChange?: (mode: ListViewMode) => void
  // Liste görünümünde satıra eklenecek ek düğme (ör. klasör menüsü)
  renderRowExtra?: (item: ListableItem) => ReactNode
  // Arama kutusunun üstüne eklenecek şerit (ör. "Son izlenenler")
  topStrip?: ReactNode
  onContextMenu?: (item: ListableItem, x: number, y: number) => void
  onReorder?: (draggedId: string, targetId: string) => void
  emptyIcon?: EmptyIllustrationKind
}

const TILE_COLS = 3

export function ItemListColumn({
  items,
  activeGroup,
  selectedId,
  onSelect,
  favoriteIds,
  onToggleFavorite,
  emptyTitle,
  emptyHint,
  headerAction,
  viewMode = 'list',
  onViewModeChange,
  renderRowExtra,
  topStrip,
  onContextMenu,
  onReorder,
  emptyIcon
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

  const tiles = useMemo(() => {
    const out: ListableItem[][] = []
    for (let i = 0; i < filtered.length; i += TILE_COLS) out.push(filtered.slice(i, i + TILE_COLS))
    return out
  }, [filtered])

  return (
    <div className={`pane pane-items view-${viewMode}`}>
      {topStrip}
      <div className="pane-search-row">
        <div className="pane-search">
          <IconSearch size={14} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`${filtered.length} öğede ara`}
          />
        </div>
        {onViewModeChange && (
          <div className="view-toggle">
            <button
              className={viewMode === 'list' ? 'active' : ''}
              onClick={() => onViewModeChange('list')}
              title="Liste görünümü"
            >
              <IconList size={14} />
            </button>
            <button
              className={viewMode === 'grid' ? 'active' : ''}
              onClick={() => onViewModeChange('grid')}
              title="Izgara görünümü"
            >
              <IconGrid size={14} />
            </button>
          </div>
        )}
        {headerAction}
      </div>
      {filtered.length === 0 ? (
        <div className="empty-state empty-state-compact">
          {emptyIcon && <EmptyIllustration kind={emptyIcon} />}
          <h3>{emptyTitle}</h3>
          <p>{emptyHint}</p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="pane-list">
          <List
            rowComponent={TileRow}
            rowCount={tiles.length}
            rowHeight={118}
            rowProps={{ tiles, selectedId, onSelect, favoriteIds, onToggleFavorite, onContextMenu }}
          />
        </div>
      ) : (
        <div className="pane-list">
          <List
            rowComponent={Row}
            rowCount={filtered.length}
            rowHeight={54}
            rowProps={{
              rows: filtered,
              selectedId,
              onSelect,
              favoriteIds,
              onToggleFavorite,
              renderRowExtra,
              onContextMenu,
              onReorder
            }}
          />
        </div>
      )}
    </div>
  )
}
