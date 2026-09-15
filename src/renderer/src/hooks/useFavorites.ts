import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  loadFavoriteFolders,
  loadFavorites,
  saveFavoriteFolders,
  saveFavorites,
  type FavoriteEntry,
  type FavoriteFolder
} from '../lib/storage'

export type { FavoriteFolder }

export interface FavoritesApi {
  favoriteIds: Set<string>
  // Favorilere eklenme sırası (elle sıralanabilir — bkz. reorderFavorites)
  orderedFavoriteIds: string[]
  toggleFavorite: (channelId: string) => void
  isFavorite: (channelId: string) => boolean
  folders: FavoriteFolder[]
  createFolder: (name: string) => string
  renameFolder: (id: string, name: string) => void
  deleteFolder: (id: string) => void
  // Kanalı klasöre ekler/çıkarır; eklerken favorilere de ekler
  toggleInFolder: (folderId: string, channelId: string) => void
  // draggedId'yi listede targetId'nin hemen öncesine taşır
  reorderFavorites: (draggedId: string, targetId: string) => void
}

export function useFavorites(): FavoritesApi {
  const [entries, setEntries] = useState<FavoriteEntry[]>([])
  const [folders, setFolders] = useState<FavoriteFolder[]>([])

  useEffect(() => {
    loadFavorites().then(setEntries)
    loadFavoriteFolders().then(setFolders)
  }, [])

  const updateFolders = useCallback((fn: (prev: FavoriteFolder[]) => FavoriteFolder[]) => {
    setFolders((prev) => {
      const next = fn(prev)
      saveFavoriteFolders(next)
      return next
    })
  }, [])

  const toggleFavorite = useCallback(
    (channelId: string) => {
      setEntries((prev) => {
        const exists = prev.some((e) => e.channelId === channelId)
        const next = exists
          ? prev.filter((e) => e.channelId !== channelId)
          : [...prev, { channelId, addedAt: Date.now() }]
        saveFavorites(next)
        // Favoriden çıkan kanal klasörlerden de çıkar
        if (exists) {
          updateFolders((fs) =>
            fs.map((f) => ({ ...f, channelIds: f.channelIds.filter((id) => id !== channelId) }))
          )
        }
        return next
      })
    },
    [updateFolders]
  )

  const favoriteIds = useMemo(() => new Set(entries.map((e) => e.channelId)), [entries])

  const createFolder = useCallback(
    (name: string) => {
      const id = `folder-${Date.now()}`
      updateFolders((fs) => [...fs, { id, name, channelIds: [] }])
      return id
    },
    [updateFolders]
  )

  const renameFolder = useCallback(
    (id: string, name: string) => updateFolders((fs) => fs.map((f) => (f.id === id ? { ...f, name } : f))),
    [updateFolders]
  )

  const deleteFolder = useCallback(
    (id: string) => updateFolders((fs) => fs.filter((f) => f.id !== id)),
    [updateFolders]
  )

  const toggleInFolder = useCallback(
    (folderId: string, channelId: string) => {
      let added = false
      updateFolders((fs) =>
        fs.map((f) => {
          if (f.id !== folderId) return f
          if (f.channelIds.includes(channelId)) {
            return { ...f, channelIds: f.channelIds.filter((id) => id !== channelId) }
          }
          added = true
          return { ...f, channelIds: [...f.channelIds, channelId] }
        })
      )
      if (added) {
        setEntries((prev) => {
          if (prev.some((e) => e.channelId === channelId)) return prev
          const next = [...prev, { channelId, addedAt: Date.now() }]
          saveFavorites(next)
          return next
        })
      }
    },
    [updateFolders]
  )

  const reorderFavorites = useCallback((draggedId: string, targetId: string) => {
    if (draggedId === targetId) return
    setEntries((prev) => {
      const dragged = prev.find((e) => e.channelId === draggedId)
      if (!dragged) return prev
      const withoutDragged = prev.filter((e) => e.channelId !== draggedId)
      const targetIndex = withoutDragged.findIndex((e) => e.channelId === targetId)
      if (targetIndex === -1) return prev
      const next = [...withoutDragged.slice(0, targetIndex), dragged, ...withoutDragged.slice(targetIndex)]
      saveFavorites(next)
      return next
    })
  }, [])

  return {
    favoriteIds,
    orderedFavoriteIds: useMemo(() => entries.map((e) => e.channelId), [entries]),
    toggleFavorite,
    isFavorite: (channelId: string) => favoriteIds.has(channelId),
    folders,
    createFolder,
    renameFolder,
    deleteFolder,
    toggleInFolder,
    reorderFavorites
  }
}
