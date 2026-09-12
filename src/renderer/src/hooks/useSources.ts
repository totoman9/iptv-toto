import { useCallback, useEffect, useState } from 'react'
import type { SourceConfig } from '../../../shared/types'
import { loadActiveSourceId, loadSources, saveActiveSourceId, saveSources } from '../lib/storage'

export interface SourcesApi {
  sources: SourceConfig[]
  activeSource: SourceConfig | null
  activeSourceId: string | null
  ready: boolean
  addSource: (source: SourceConfig) => void
  removeSource: (id: string) => void
  setActiveSourceId: (id: string) => void
}

export function useSources(): SourcesApi {
  const [sources, setSources] = useState<SourceConfig[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    Promise.all([loadSources(), loadActiveSourceId()]).then(([storedSources, storedActiveId]) => {
      setSources(storedSources)
      setActiveId(storedActiveId || storedSources[0]?.id || null)
      setReady(true)
    })
  }, [])

  const addSource = useCallback((source: SourceConfig) => {
    setSources((prev) => {
      const next = [...prev, source]
      saveSources(next)
      return next
    })
    setActiveId(source.id)
    saveActiveSourceId(source.id)
  }, [])

  const removeSource = useCallback((id: string) => {
    setSources((prev) => {
      const next = prev.filter((s) => s.id !== id)
      saveSources(next)
      return next
    })
    setActiveId((prev) => {
      if (prev !== id) return prev
      return null
    })
  }, [])

  const setActiveSourceId = useCallback((id: string) => {
    setActiveId(id)
    saveActiveSourceId(id)
  }, [])

  return {
    sources,
    activeSource: sources.find((s) => s.id === activeId) || null,
    activeSourceId: activeId,
    ready,
    addSource,
    removeSource,
    setActiveSourceId
  }
}
