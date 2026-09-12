import { useCallback, useEffect, useState } from 'react'
import {
  loadLockedGroups,
  loadParentalPin,
  saveLockedGroups,
  saveParentalPin
} from '../lib/storage'

export interface ParentalLockApi {
  pin: string | null
  lockedGroups: string[]
  sessionUnlocked: boolean
  ready: boolean
  isLocked: (group: string) => boolean
  setPin: (pin: string) => void
  clearAll: () => void
  toggleGroupLock: (group: string) => void
  tryUnlock: (candidate: string) => boolean
  lockSessionAgain: () => void
}

export function useParentalLock(): ParentalLockApi {
  const [pin, setPinState] = useState<string | null>(null)
  const [lockedGroups, setLockedGroups] = useState<string[]>([])
  const [sessionUnlocked, setSessionUnlocked] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    Promise.all([loadParentalPin(), loadLockedGroups()]).then(([storedPin, storedGroups]) => {
      setPinState(storedPin)
      setLockedGroups(storedGroups)
      setReady(true)
    })
  }, [])

  const isLocked = useCallback(
    (group: string) => !sessionUnlocked && lockedGroups.includes(group),
    [lockedGroups, sessionUnlocked]
  )

  const setPin = useCallback((newPin: string) => {
    setPinState(newPin)
    saveParentalPin(newPin)
  }, [])

  const clearAll = useCallback(() => {
    setPinState(null)
    setLockedGroups([])
    saveParentalPin(null)
    saveLockedGroups([])
    setSessionUnlocked(true)
  }, [])

  const toggleGroupLock = useCallback((group: string) => {
    setLockedGroups((prev) => {
      const next = prev.includes(group) ? prev.filter((g) => g !== group) : [...prev, group]
      saveLockedGroups(next)
      return next
    })
  }, [])

  const tryUnlock = useCallback(
    (candidate: string) => {
      if (candidate === pin) {
        setSessionUnlocked(true)
        return true
      }
      return false
    },
    [pin]
  )

  const lockSessionAgain = useCallback(() => setSessionUnlocked(false), [])

  return {
    pin,
    lockedGroups,
    sessionUnlocked,
    ready,
    isLocked,
    setPin,
    clearAll,
    toggleGroupLock,
    tryUnlock,
    lockSessionAgain
  }
}
