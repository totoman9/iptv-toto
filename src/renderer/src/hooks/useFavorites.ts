import { useCallback, useEffect, useState } from 'react'
import { loadFavorites, saveFavorites, type FavoriteEntry } from '../lib/storage'

export interface FavoritesApi {
  favoriteIds: Set<string>
  toggleFavorite: (channelId: string) => void
  isFavorite: (channelId: string) => boolean
}

export function useFavorites(): FavoritesApi {
  const [entries, setEntries] = useState<FavoriteEntry[]>([])

  useEffect(() => {
    loadFavorites().then(setEntries)
  }, [])

  const toggleFavorite = useCallback((channelId: string) => {
    setEntries((prev) => {
      const exists = prev.some((e) => e.channelId === channelId)
      const next = exists
        ? prev.filter((e) => e.channelId !== channelId)
        : [...prev, { channelId, addedAt: Date.now() }]
      saveFavorites(next)
      return next
    })
  }, [])

  const favoriteIds = new Set(entries.map((e) => e.channelId))

  return {
    favoriteIds,
    toggleFavorite,
    isFavorite: (channelId: string) => favoriteIds.has(channelId)
  }
}
