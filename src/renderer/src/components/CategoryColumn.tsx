import { useMemo, useState, type ReactElement } from 'react'

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
}

export const ALL_GROUP = '__all__'

export function CategoryColumn({
  items,
  activeGroup,
  onSelectGroup,
  allLabel = 'Tüm kanallar'
}: Props): ReactElement {
  const [search, setSearch] = useState('')

  const categories = useMemo<CategoryEntry[]>(() => {
    const counts = new Map<string, number>()
    for (const item of items) counts.set(item.group, (counts.get(item.group) || 0) + 1)
    const entries = Array.from(counts.entries())
      .map(([key, count]) => ({ key, label: key, count }))
      .sort((a, b) => a.label.localeCompare(b.label, 'tr'))
    return [{ key: ALL_GROUP, label: allLabel, count: items.length }, ...entries]
  }, [items, allLabel])

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr')
    if (!q) return categories
    return categories.filter(
      (c) => c.key === ALL_GROUP || c.label.toLocaleLowerCase('tr').includes(q)
    )
  }, [categories, search])

  return (
    <div className="pane pane-categories">
      <div className="pane-search">
        <span>🔍</span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`${categories.length - 1} kategoride ara`}
        />
      </div>
      <div className="pane-list category-list">
        {filtered.map((c) => (
          <div
            key={c.key}
            className={`category-row ${activeGroup === c.key ? 'active' : ''}`}
            onClick={() => onSelectGroup(c.key)}
          >
            <span className="category-row-label">{c.label}</span>
            <span className="category-count">{c.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
