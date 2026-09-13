import { useCallback, useEffect, useState } from 'react'
import {
  BUILT_IN_PROFILES,
  DEFAULT_PICTURE,
  loadPicture,
  savePicture,
  type PictureFit,
  type PictureProfile,
  type PictureSettings,
  type StoredPicture
} from '../lib/pictureSettings'

export type PictureNumberKey = Exclude<keyof PictureSettings, 'fit'>

export interface PictureApi {
  settings: PictureSettings
  activeId: string | null
  profiles: PictureProfile[]
  setValue: (key: PictureNumberKey, value: number) => void
  setFit: (fit: PictureFit) => void
  applyProfile: (id: string) => void
  saveProfile: (name: string) => void
  deleteProfile: (id: string) => void
  reset: () => void
}

export function usePictureSettings(): PictureApi {
  const [state, setState] = useState<StoredPicture>(loadPicture)

  useEffect(() => savePicture(state), [state])

  const profiles = [...BUILT_IN_PROFILES, ...state.custom]

  const setValue = useCallback((key: PictureNumberKey, value: number) => {
    // Elle değiştirilince artık hiçbir profil "seçili" değil
    setState((s) => ({ ...s, activeId: null, current: { ...s.current, [key]: value } }))
  }, [])

  const setFit = useCallback((fit: PictureFit) => {
    setState((s) => ({ ...s, current: { ...s.current, fit } }))
  }, [])

  const applyProfile = useCallback((id: string) => {
    setState((s) => {
      const p = [...BUILT_IN_PROFILES, ...s.custom].find((x) => x.id === id)
      if (!p) return s
      // Görüntü boyutu (sığdır/doldur) profilden bağımsız, olduğu gibi kalsın
      return { ...s, activeId: id, current: { ...p.settings, fit: s.current.fit } }
    })
  }, [])

  const saveProfile = useCallback((name: string) => {
    setState((s) => {
      const id = `custom-${Date.now()}`
      const profile: PictureProfile = { id, name, settings: s.current }
      return { ...s, activeId: id, custom: [...s.custom, profile] }
    })
  }, [])

  const deleteProfile = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      activeId: s.activeId === id ? null : s.activeId,
      custom: s.custom.filter((p) => p.id !== id)
    }))
  }, [])

  const reset = useCallback(() => {
    setState((s) => ({ ...s, activeId: 'standard', current: { ...DEFAULT_PICTURE, fit: s.current.fit } }))
  }, [])

  return {
    settings: state.current,
    activeId: state.activeId,
    profiles,
    setValue,
    setFit,
    applyProfile,
    saveProfile,
    deleteProfile,
    reset
  }
}
