// Program hatırlatıcıları: program başlamadan 5 dakika önce bildirim.
// Uygulama açıkken çalışır.

export interface Reminder {
  id: string
  channelId: string
  streamId?: number
  channelName: string
  logo?: string
  title: string
  start: number
  end: number
  notified?: boolean
}

export const REMINDER_LEAD_MS = 5 * 60 * 1000

const KEY = 'reminders'

export const reminderId = (channelId: string, start: number): string => `${channelId}@${start}`

export async function loadReminders(): Promise<Reminder[]> {
  return (await window.iptv.store.read<Reminder[]>(KEY)) || []
}

export function saveReminders(list: Reminder[]): void {
  void window.iptv.store.write(KEY, list)
}
