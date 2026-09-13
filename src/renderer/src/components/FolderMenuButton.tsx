import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import type { FavoriteFolder } from '../lib/storage'
import { IconCheck, IconFolder } from './Icons'

interface Props {
  channelId: string
  folders: FavoriteFolder[]
  onToggle: (folderId: string, channelId: string) => void
  onCreate: (name: string) => string
}

// Kanal satırındaki klasör düğmesi: kanalı favori klasörlerine ekler/çıkarır.
// Menü, kaydırılan listenin dışına taşabilsin diye sayfa gövdesine çizilir.
export function FolderMenuButton({ channelId, folders, onToggle, onCreate }: Props): ReactElement {
  const [style, setStyle] = useState<CSSProperties | null>(null)
  const [newName, setNewName] = useState('')
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const inCount = folders.filter((f) => f.channelIds.includes(channelId)).length

  useEffect(() => {
    if (!style) return
    const onDown = (e: MouseEvent): void => {
      const t = e.target as Node
      if (!menuRef.current?.contains(t) && !buttonRef.current?.contains(t)) setStyle(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [style])

  function toggleMenu(e: React.MouseEvent): void {
    e.stopPropagation()
    if (style) {
      setStyle(null)
      return
    }
    const r = buttonRef.current!.getBoundingClientRect()
    const above = r.bottom + 300 > window.innerHeight
    setStyle({
      left: Math.min(r.right, window.innerWidth - 12),
      top: above ? r.top - 6 : r.bottom + 6,
      transform: `translateX(-100%)${above ? ' translateY(-100%)' : ''}`
    })
  }

  return (
    <>
      <button
        ref={buttonRef}
        className={`channel-row-folder ${inCount ? 'active' : ''}`}
        onClick={toggleMenu}
        title="Klasöre ekle"
      >
        <IconFolder size={13} />
      </button>
      {style &&
        createPortal(
          <div
            ref={menuRef}
            className="folder-menu"
            style={style}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="folder-menu-title">Klasörlere ekle</div>
            {folders.length === 0 && <div className="folder-menu-empty">Henüz klasör yok</div>}
            {folders.map((f) => {
              const on = f.channelIds.includes(channelId)
              return (
                <button
                  key={f.id}
                  className={`folder-menu-item ${on ? 'on' : ''}`}
                  onClick={() => onToggle(f.id, channelId)}
                >
                  <span className="folder-menu-check">{on && <IconCheck size={12} />}</span>
                  {f.name}
                </button>
              )
            })}
            <input
              className="folder-menu-new"
              placeholder="+ Yeni klasör (Enter)"
              value={newName}
              maxLength={30}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newName.trim()) {
                  const id = onCreate(newName.trim())
                  onToggle(id, channelId)
                  setNewName('')
                }
              }}
            />
          </div>,
          document.body
        )}
    </>
  )
}
