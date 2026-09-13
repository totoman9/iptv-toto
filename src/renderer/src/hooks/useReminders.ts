import { useCallback, useEffect, useState } from 'react'
import { loadReminders, reminderId, saveReminders, type Reminder } from '../lib/reminders'

export interface RemindersApi {
  reminders: Reminder[]
  has: (channelId: string, start: number) => boolean
  toggle: (r: Omit<Reminder, 'id' | 'notified'>) => void
  remove: (id: string) => void
  markNotified: (id: string) => void
}

export function useReminders(): RemindersApi {
  const [list, setList] = useState<Reminder[]>([])

  useEffect(() => {
    // Bitmiş programların hatırlatıcılarını temizle
    loadReminders().then((l) => setList(l.filter((r) => r.end > Date.now())))
  }, [])

  const update = useCallback((fn: (prev: Reminder[]) => Reminder[]) => {
    setList((prev) => {
      const next = fn(prev)
      saveReminders(next)
      return next
    })
  }, [])

  const has = useCallback(
    (channelId: string, start: number) => list.some((r) => r.id === reminderId(channelId, start)),
    [list]
  )

  const toggle = useCallback(
    (r: Omit<Reminder, 'id' | 'notified'>) => {
      const id = reminderId(r.channelId, r.start)
      update((prev) => (prev.some((x) => x.id === id) ? prev.filter((x) => x.id !== id) : [...prev, { ...r, id }]))
    },
    [update]
  )

  const remove = useCallback((id: string) => update((prev) => prev.filter((x) => x.id !== id)), [update])

  const markNotified = useCallback(
    (id: string) => update((prev) => prev.map((x) => (x.id === id ? { ...x, notified: true } : x))),
    [update]
  )

  return { reminders: list, has, toggle, remove, markNotified }
}
