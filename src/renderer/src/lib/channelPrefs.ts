import { createPersisted } from './persisted'

// Kanal grubu başına (bkz. channelGroups.ts) hangi kalite varyantının
// seçildiği hatırlanır — anahtar ChannelGroup.key, değer o gruptaki tercih
// edilen kanalın id'si.
export const channelQualityPrefs = createPersisted<Record<string, string>>('channel-quality-prefs', {})

export function setPreferredChannel(groupKey: string, channelId: string): void {
  const prev = channelQualityPrefs.get()
  if (prev[groupKey] === channelId) return
  channelQualityPrefs.set({ ...prev, [groupKey]: channelId })
}
