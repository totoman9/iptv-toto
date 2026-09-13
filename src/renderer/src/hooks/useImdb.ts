import { useEffect, useState } from 'react'
import { lookupImdb, NoOmdbKeyError, type ImdbInfo } from '../lib/omdb'
import { useSettings } from './useSettings'

export type ImdbStatus = 'idle' | 'loading' | 'nokey' | 'notfound' | 'error' | 'ready'

export interface ImdbState {
  info: ImdbInfo | null
  status: ImdbStatus
  error?: string
}

// names: denenecek adlar (ör. orijinal ad, sağlayıcıdaki ad)
export function useImdb(
  names: (string | undefined)[],
  year: string | undefined,
  type: 'movie' | 'series',
  ready: boolean
): ImdbState {
  const { omdbKey } = useSettings()
  const [state, setState] = useState<ImdbState>({ info: null, status: 'idle' })
  const namesKey = names.filter(Boolean).join('|')

  useEffect(() => {
    if (!ready) return
    if (!omdbKey) {
      setState({ info: null, status: 'nokey' })
      return
    }
    let cancelled = false
    setState({ info: null, status: 'loading' })
    lookupImdb(names, year, type)
      .then((info) => {
        if (!cancelled) setState({ info, status: info ? 'ready' : 'notfound' })
      })
      .catch((err) => {
        if (cancelled) return
        if (err instanceof NoOmdbKeyError) setState({ info: null, status: 'nokey' })
        else setState({ info: null, status: 'error', error: err instanceof Error ? err.message : undefined })
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namesKey, year, type, ready, omdbKey])

  return state
}
