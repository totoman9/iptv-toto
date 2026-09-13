// Kategori düzeni: kaynak ve bölüm (canlı / film / dizi) başına gizlenen ve
// üste sabitlenen kategoriler.

export type CategorySection = 'live' | 'vod' | 'series'

export interface SectionPrefs {
  hidden: string[]
  pinned: string[]
}

export type AllCategoryPrefs = Record<string, Partial<Record<CategorySection, SectionPrefs>>>

export const EMPTY_PREFS: SectionPrefs = { hidden: [], pinned: [] }

const KEY = 'category-prefs'

export async function loadCategoryPrefs(): Promise<AllCategoryPrefs> {
  return (await window.iptv.store.read<AllCategoryPrefs>(KEY)) || {}
}

export function saveCategoryPrefs(prefs: AllCategoryPrefs): void {
  void window.iptv.store.write(KEY, prefs)
}

// Sabitlenenler en üstte (sabitlendikleri sırayla), gizlenenler hiç yok
export function applyCategoryOrder(order: string[], prefs: SectionPrefs): string[] {
  const hidden = new Set(prefs.hidden)
  const pinned = prefs.pinned.filter((g) => !hidden.has(g))
  const pinnedSet = new Set(pinned)
  return [...pinned, ...order.filter((g) => !hidden.has(g) && !pinnedSet.has(g))]
}

export function withoutHidden<T extends { group: string }>(items: T[], prefs: SectionPrefs): T[] {
  if (prefs.hidden.length === 0) return items
  const hidden = new Set(prefs.hidden)
  return items.filter((i) => !hidden.has(i.group))
}
