import { useEffect, useMemo, useState } from 'react'
import type { ContinueWatchingEntry } from '../lib/storage'
import { subscribeProgress } from '../lib/continueWatching'

// "Kaldığın yer" kayıtlarını canlı olarak izler; oynatıcı konum kaydettikçe
// film/dizi ekranındaki ilerleme çubukları kendiliğinden güncellenir.
export function useProgress(): {
  entries: ContinueWatchingEntry[]
  byId: Map<string, ContinueWatchingEntry>
} {
  const [entries, setEntries] = useState<ContinueWatchingEntry[]>([])
  useEffect(() => subscribeProgress(setEntries), [])
  const byId = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries])
  return { entries, byId }
}
