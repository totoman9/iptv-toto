import { useEffect, useState } from 'react'
import { getSettings, subscribeSettings, type AppSettings } from '../lib/settings'

export function useSettings(): AppSettings {
  const [settings, setSettings] = useState<AppSettings>(getSettings)
  useEffect(() => subscribeSettings(setSettings), [])
  return settings
}
