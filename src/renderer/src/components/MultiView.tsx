import { useEffect, useMemo, useState, type ReactElement } from 'react'
import type { Channel } from '../../../shared/types'
import { multiViewUrl } from '../lib/proxy'
import { fold } from '../lib/search'
import { IconClose, IconPlus, IconVolume } from './Icons'

interface Props {
  channels: Channel[]
  favorites: Channel[]
  start: Channel | null
  // Hesabın aynı anda izin verdiği bağlantı sayısı (bilinmiyorsa null)
  maxSlots: number | null
  onClose: () => void
}

// Çoklu ekran: 2 ya da 4 kanalı aynı anda izleme. Her ekran sunucuya ayrı
// bağlantı açar; hesabın bağlantı sınırını aşan ekranlar boş bırakılır.
export function MultiView({ channels, favorites, start, maxSlots, onClose }: Props): ReactElement {
  const limit = Math.max(1, Math.min(4, maxSlots ?? 4))
  const [layout, setLayout] = useState<2 | 4>(limit >= 3 ? 4 : 2)
  const [tiles, setTiles] = useState<(Channel | null)[]>([start, null, null, null])
  const [failed, setFailed] = useState<Record<number, boolean>>({})
  const [active, setActive] = useState(0)
  const [picker, setPicker] = useState<number | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      if (picker !== null) setPicker(null)
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [picker, onClose])

  const pickList = useMemo(() => {
    const q = fold(query.trim())
    if (!q) return [...favorites, ...channels.filter((c) => !favorites.some((f) => f.id === c.id))].slice(0, 80)
    const out: Channel[] = []
    for (const c of channels) {
      if (fold(c.name).includes(q)) out.push(c)
      if (out.length >= 80) break
    }
    return out
  }, [query, channels, favorites])

  function setTile(i: number, ch: Channel | null): void {
    setTiles((t) => t.map((x, j) => (j === i ? ch : x)))
    setFailed((f) => ({ ...f, [i]: false }))
  }

  return (
    <div className="mv-overlay">
      <div className="mv-header">
        <div className="mv-title">Çoklu ekran</div>
        <div className="seg-toggle">
          <button className={layout === 2 ? 'active' : ''} onClick={() => setLayout(2)} title="Yan yana 2 kanal">
            2'li
          </button>
          <button className={layout === 4 ? 'active' : ''} onClick={() => setLayout(4)} title="2×2, 4 kanal">
            4'lü
          </button>
        </div>
        <span className="mv-note">
          {maxSlots === null
            ? 'Ses, seçili (çerçeveli) ekrandan gelir; ekrana tıklayarak sesi değiştir.'
            : limit < layout
              ? `Hesabın aynı anda ${limit} bağlantıya izin veriyor; fazla ekranlar boş kalır. Daha fazlası için sağlayıcından çok bağlantılı paket gerekir.`
              : `Hesabın ${limit} bağlantıya izin veriyor. Ses, seçili (çerçeveli) ekrandan gelir.`}
        </span>
        <div className="topbar-spacer" />
        <button className="icon-btn" onClick={onClose} title="Çoklu ekranı kapat (Esc)">
          <IconClose size={15} />
        </button>
      </div>

      <div className={`mv-grid mv-grid-${layout}`}>
        {tiles.slice(0, layout).map((ch, i) => {
          const allowed = i < limit
          return (
            <div
              key={i}
              className={`mv-tile ${active === i ? 'is-active' : ''}`}
              onClick={() => setActive(i)}
            >
              {ch && allowed ? (
                <>
                  <video
                    key={ch.id}
                    src={multiViewUrl(ch.url, i)}
                    autoPlay
                    playsInline
                    muted={active !== i}
                    onError={() => setFailed((f) => ({ ...f, [i]: true }))}
                  />
                  {failed[i] && <div className="mv-failed">Bu kanal açılamadı</div>}
                  <div className="mv-tile-bar">
                    {active === i && <IconVolume size={13} />}
                    <span className="mv-tile-name">{ch.name}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setPicker(i)
                        setQuery('')
                      }}
                      title="Bu ekrandaki kanalı değiştir"
                    >
                      Değiştir
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setTile(i, null)
                      }}
                      title="Bu ekranı boşalt"
                    >
                      <IconClose size={11} />
                    </button>
                  </div>
                </>
              ) : (
                <div className="mv-empty">
                  {allowed ? (
                    <button
                      className="btn-secondary"
                      onClick={(e) => {
                        e.stopPropagation()
                        setPicker(i)
                        setQuery('')
                      }}
                    >
                      <IconPlus size={14} /> Kanal ekle
                    </button>
                  ) : (
                    <span>Hesap sınırı: aynı anda {limit} bağlantı</span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {picker !== null && (
        <div className="mv-picker-backdrop" onClick={() => setPicker(null)}>
          <div className="mv-picker" onClick={(e) => e.stopPropagation()}>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Kanal ara… (boşken favoriler önde)"
            />
            <div className="mv-picker-list">
              {pickList.map((c) => (
                <button
                  key={c.id}
                  className="mv-picker-row"
                  onClick={() => {
                    setTile(picker, c)
                    setActive(picker)
                    setPicker(null)
                  }}
                >
                  <span className="mv-picker-logo">
                    {c.logo && <img src={c.logo} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />}
                  </span>
                  <span className="mv-picker-name">{c.name}</span>
                  <span className="mv-picker-group">{c.group}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
