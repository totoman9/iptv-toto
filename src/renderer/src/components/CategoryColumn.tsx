import { useMemo, useState, type ReactElement } from 'react'
import { IconEdit, IconLock, IconSearch } from './Icons'

export interface CategoryEntry {
  key: string
  label: string
  count: number
}

interface Props {
  items: { group: string }[]
  activeGroup: string
  onSelectGroup: (group: string) => void
  allLabel?: string
  // Sağlayıcının kategori sırası (varsa). Örn. Xtream panelleri genelde TR
  // kategorileri en başa koyar; bu sırayı bozmamak için alfabetik sıralama
  // yerine bunu kullanıyoruz.
  orderedGroups?: string[]
  // Kilitli kategori adları — sadece küçük bir kilit ikonu göstermek için;
  // gerçek engelleme üst bileşendeki onSelectGroup çağrısında yapılır.
  lockedGroups?: string[]
  // Kategori düzenleyicisini (gizle / üste sabitle) aç
  onEdit?: () => void
}

export const ALL_GROUP = '__all__'

export function CategoryColumn({
  items,
  activeGroup,
  onSelectGroup,
  allLabel = 'Tüm kanallar',
  orderedGroups,
  lockedGroups,
  onEdit
}: Props): ReactElement {
  const [search, setSearch] = useState('')

  const categories = useMemo<CategoryEntry[]>(() => {
    const counts = new Map<string, number>()
    for (const item of items) counts.set(item.group, (counts.get(item.group) || 0) + 1)

    let entries: CategoryEntry[]
    if (orderedGroups && orderedGroups.length > 0) {
      // Sağlayıcı sırasını koru; listede olmayan (ör. sonradan eklenmiş)
      // grupları sona, alfabetik ekle.
      const known = new Set(orderedGroups)
      const ordered = orderedGroups
        .filter((g) => counts.has(g))
        .map((key) => ({ key, label: key, count: counts.get(key) || 0 }))
      const extra = Array.from(counts.keys())
        .filter((g) => !known.has(g))
        .sort((a, b) => a.localeCompare(b, 'tr'))
        .map((key) => ({ key, label: key, count: counts.get(key) || 0 }))
      entries = [...ordered, ...extra]
    } else {
      entries = Array.from(counts.entries())
        .map(([key, count]) => ({ key, label: key, count }))
        .sort((a, b) => a.label.localeCompare(b.label, 'tr'))
    }

    return [{ key: ALL_GROUP, label: allLabel, count: items.length }, ...entries]
  }, [items, allLabel, orderedGroups])

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr')
    if (!q) return categories
    return categories.filter(
      (c) => c.key === ALL_GROUP || c.label.toLocaleLowerCase('tr').includes(q)
    )
  }, [categories, search])

  return (
    <div className="pane pane-categories">
      <div className="pane-search-row">
        <div className="pane-search">
          <IconSearch size={14} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`${categories.length - 1} kategoride ara`}
          />
        </div>
        {onEdit && (
          <button className="icon-btn" onClick={onEdit} title="Kategorileri düzenle (gizle / sabitle)">
            <IconEdit size={14} />
          </button>
        )}
      </div>
      <div className="pane-list category-list">
        {filtered.map((c) => (
          <div
            key={c.key}
            className={`category-row ${activeGroup === c.key ? 'active' : ''}`}
            onClick={() => onSelectGroup(c.key)}
          >
            <span className="category-row-label">{c.label}</span>
            {lockedGroups?.includes(c.key) ? (
              <IconLock size={12} className="category-lock-icon" />
            ) : (
              <span className="category-count">{c.count}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
