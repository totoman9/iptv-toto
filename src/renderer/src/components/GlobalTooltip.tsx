import { useEffect, useRef, useState, type ReactElement } from 'react'
import { createPortal } from 'react-dom'

interface Tip {
  text: string
  x: number
  y: number
  below: boolean
  container: Element
}

// Uygulamadaki her düğmenin "title" açıklamasını, fare üstüne gelir gelmez
// (sistemin geç çıkan sarı kutusu yerine) şık bir etiket olarak gösterir.
// Tam ekranda da çalışsın diye etiket tam ekran öğesinin içine çizilir.
export function GlobalTooltip(): ReactElement | null {
  const [tip, setTip] = useState<Tip | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let current: HTMLElement | null = null

    const hide = (): void => {
      if (timer.current) clearTimeout(timer.current)
      current = null
      setTip(null)
    }

    const onOver = (e: MouseEvent): void => {
      const target = e.target as HTMLElement | null
      const el = target?.closest?.('[title],[data-tip]') as HTMLElement | null
      if (el === current) return
      if (timer.current) clearTimeout(timer.current)
      current = el
      setTip(null)
      if (!el) return
      // Sistemin kendi araç ipucu çıkmasın: metni data-tip'e taşı
      const title = el.getAttribute('title')
      if (title) {
        el.dataset.tip = title
        el.removeAttribute('title')
      }
      const text = el.dataset.tip
      if (!text) return
      timer.current = setTimeout(() => {
        if (current !== el || !el.isConnected) return
        const r = el.getBoundingClientRect()
        const below = r.top < 70
        setTip({
          text,
          x: Math.min(Math.max(r.left + r.width / 2, 90), window.innerWidth - 90),
          y: below ? r.bottom + 8 : r.top - 8,
          below,
          container: document.fullscreenElement ?? document.body
        })
      }, 220)
    }

    document.addEventListener('mouseover', onOver)
    document.addEventListener('mousedown', hide)
    document.addEventListener('keydown', hide)
    window.addEventListener('scroll', hide, true)
    window.addEventListener('blur', hide)
    return () => {
      document.removeEventListener('mouseover', onOver)
      document.removeEventListener('mousedown', hide)
      document.removeEventListener('keydown', hide)
      window.removeEventListener('scroll', hide, true)
      window.removeEventListener('blur', hide)
    }
  }, [])

  if (!tip) return null
  return createPortal(
    <div className={`global-tip ${tip.below ? 'is-below' : ''}`} style={{ left: tip.x, top: tip.y }}>
      {tip.text}
    </div>,
    tip.container
  )
}
