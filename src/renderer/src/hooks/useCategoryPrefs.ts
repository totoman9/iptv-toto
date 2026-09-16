import { useCallback, useEffect, useState } from 'react'
import {
  EMPTY_PREFS,
  loadCategoryPrefs,
  saveCategoryPrefs,
  type AllCategoryPrefs,
  type CategorySection,
  type SectionPrefs
} from '../lib/categoryPrefs'

export interface CategoryPrefsApi {
  get: (section: CategorySection) => SectionPrefs
  toggleHidden: (section: CategorySection, group: string) => void
  togglePinned: (section: CategorySection, group: string) => void
  movePinned: (section: CategorySection, group: string, dir: -1 | 1) => void
  reset: (section: CategorySection) => void
  // 200+ kategorisi olan hesaplarda teker teker gizlemek yerine hepsini
  // gizleyip sonra kullanacaklarını tek tek göstermek çok daha hızlı
  hideAll: (section: CategorySection, allGroups: string[]) => void
  showAll: (section: CategorySection) => void
}

export function useCategoryPrefs(sourceId: string | null): CategoryPrefsApi {
  const [all, setAll] = useState<AllCategoryPrefs>({})

  useEffect(() => {
    loadCategoryPrefs().then(setAll)
  }, [])

  const update = useCallback(
    (section: CategorySection, fn: (p: SectionPrefs) => SectionPrefs) => {
      if (!sourceId) return
      setAll((prev) => {
        const current = prev[sourceId]?.[section] ?? EMPTY_PREFS
        const next = { ...prev, [sourceId]: { ...prev[sourceId], [section]: fn(current) } }
        saveCategoryPrefs(next)
        return next
      })
    },
    [sourceId]
  )

  const get = useCallback(
    (section: CategorySection) => (sourceId && all[sourceId]?.[section]) || EMPTY_PREFS,
    [all, sourceId]
  )

  return {
    get,
    // Gizlenen kategori sabitlenmiş olamaz
    toggleHidden: (section, group) =>
      update(section, (p) =>
        p.hidden.includes(group)
          ? { ...p, hidden: p.hidden.filter((g) => g !== group) }
          : { hidden: [...p.hidden, group], pinned: p.pinned.filter((g) => g !== group) }
      ),
    togglePinned: (section, group) =>
      update(section, (p) =>
        p.pinned.includes(group)
          ? { ...p, pinned: p.pinned.filter((g) => g !== group) }
          : { hidden: p.hidden.filter((g) => g !== group), pinned: [...p.pinned, group] }
      ),
    movePinned: (section, group, dir) =>
      update(section, (p) => {
        const i = p.pinned.indexOf(group)
        const j = i + dir
        if (i < 0 || j < 0 || j >= p.pinned.length) return p
        const pinned = [...p.pinned]
        ;[pinned[i], pinned[j]] = [pinned[j], pinned[i]]
        return { ...p, pinned }
      }),
    reset: (section) => update(section, () => EMPTY_PREFS),
    // Sabitlenen bir kategori gizli olamaz; hepsini gizlerken sabitlemeler de kalkar
    hideAll: (section, allGroups) => update(section, () => ({ hidden: allGroups, pinned: [] })),
    showAll: (section) => update(section, (p) => ({ ...p, hidden: [] }))
  }
}
