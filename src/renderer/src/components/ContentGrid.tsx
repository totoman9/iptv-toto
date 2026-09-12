import { useMemo, useState, type ReactElement } from 'react'
import type { Channel, VodItem } from '../../../shared/types'

type Item = (Channel | VodItem) & { streamId?: number }

interface Props {
  items: Item[]
  search: string
  onSelect: (item: Item) => void
  favoriteIds?: Set<string>
  onToggleFavorite?: (id: string) => void
  emptyTitle: string
  emptyHint: string
}

export function ContentGrid({
  items,
  search,
  onSelect,
  favoriteIds,
  onToggleFavorite,
  emptyTitle,
  emptyHint
}: Props): ReactElement {
  const [activeGroup, setActiveGroup] = useState<string>('__all__')

  const groups = useMemo(() => {
    const set = new Set<string>()
    for (const item of items) set.add(item.group)
    return ['__all__', ...Array.from(set).sort((a, b) => a.localeCompare(b))]
  }, [items])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((item) => {
      const matchesGroup = activeGroup === '__all__' || item.group === activeGroup
      const matchesSearch = !q || item.name.toLowerCase().includes(q)
      return matchesGroup && matchesSearch
    })
  }, [items, activeGroup, search])

  if (items.length === 0) {
    return (
      <div className="empty-state">
        <h3>{emptyTitle}</h3>
        <p>{emptyHint}</p>
      </div>
    )
  }

  return (
    <div>
      <div className="chip-row">
        {groups.map((g) => (
          <button
            key={g}
            className={`chip ${activeGroup === g ? 'active' : ''}`}
            onClick={() => setActiveGroup(g)}
          >
            {g === '__all__' ? 'Tümü' : g}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <h3>Sonuç bulunamadı</h3>
          <p>Arama veya kategori seçimini değiştirmeyi dene.</p>
        </div>
      ) : (
        <div className="card-grid">
          {filtered.map((item) => (
            <div className="channel-card" key={item.id} onClick={() => onSelect(item)}>
              {favoriteIds && onToggleFavorite && (
                <button
                  className={`fav-toggle ${favoriteIds.has(item.id) ? 'active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleFavorite(item.id)
                  }}
                  title="Favorilere ekle / çıkar"
                >
                  ★
                </button>
              )}
              <div className="channel-logo-wrap">
                {item.logo ? (
                  <img src={item.logo} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />
                ) : (
                  <span className="channel-logo-fallback">{item.name.slice(0, 2).toUpperCase()}</span>
                )}
              </div>
              <div className="channel-name">{item.name}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
