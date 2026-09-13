import { useCallback, useEffect, useState } from 'react'
import type { RecordingEntry } from '../../../shared/types'

export interface RecordingsApi {
  entries: RecordingEntry[]
  active: RecordingEntry | null
  refresh: () => void
}

export function useRecordings(): RecordingsApi {
  const [entries, setEntries] = useState<RecordingEntry[]>([])

  const refresh = useCallback(() => {
    window.iptv.recordings.list().then(setEntries)
  }, [])

  useEffect(() => {
    refresh()
    return window.iptv.recordings.onChanged(refresh)
  }, [refresh])

  const active = entries.find((e) => e.status === 'recording') || null

  // Kayıt sürerken dosya boyutunu güncel göstermek için ara ara tazele
  useEffect(() => {
    if (!active) return
    const iv = setInterval(refresh, 5000)
    return () => clearInterval(iv)
  }, [active?.id, refresh])

  return { entries, active, refresh }
}
