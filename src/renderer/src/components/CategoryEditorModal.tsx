import { useMemo, useState, type ReactElement } from 'react'
import type { SectionPrefs } from '../lib/categoryPrefs'
import { fold } from '../lib/search'
import { IconChevronRight, IconEye, IconEyeOff, IconPin } from './Icons'

interface Props {
  title: string
  // Tüm kategoriler (gizliler dahil), sağlayıcı sırasıyla
  groups: { name: string; count: number }[]
  prefs: SectionPrefs
  onToggleHidden: (group: string) => void
  onTogglePinned: (group: string) => void
  onMovePinned: (group: string, dir: -1 | 1) => void
  onReset: () => void
  onClose: () => void
}

export function CategoryEditorModal({
  title,
  groups,
  prefs,
  onToggleHidden,
  onTogglePinned,
  onMovePinned,
  onReset,
  onClose
}: Props): ReactElement {
  const [search, setSearch] = useState('')
  const [onlyHidden, setOnlyHidden] = useState(false)

  const counts = useMemo(() => new Map(groups.map((g) => [g.name, g.count])), [groups])
  const pinnedSet = useMemo(() => new Set(prefs.pinned), [prefs.pinned])
  const hiddenSet = useMemo(() => new Set(prefs.hidden), [prefs.hidden])

  const rest = useMemo(() => {
    const q = fold(search.trim())
    return groups.filter(
      (g) =>
        !pinnedSet.has(g.name) &&
        (!q || fold(g.name).includes(q)) &&
        (!onlyHidden || hiddenSet.has(g.name))
    )
  }, [groups, pinnedSet, hiddenSet, search, onlyHidden])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal category-editor" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <p className="modal-sub">
          Hiç bakmadığın kategorileri gizle, sevdiklerini üste sabitle. Gizlenen kategorilerin
          içerikleri listelerde ve aramada görünmez.
        </p>

        {prefs.pinned.length > 0 && (
          <>
            <div className="cat-edit-label">Üste sabitlenenler</div>
            <div className="cat-edit-list">
              {prefs.pinned.map((g, i) => (
                <div className="cat-edit-row is-pinned" key={g}>
                  <span className="cat-edit-name">{g}</span>
                  <span className="cat-edit-count">{counts.get(g) ?? 0}</span>
                  <button
                    className="icon-btn"
                    disabled={i === 0}
                    onClick={() => onMovePinned(g, -1)}
                    title="Yukarı taşı"
                  >
                    <IconChevronRight size={13} style={{ transform: 'rotate(-90deg)' }} />
                  </button>
                  <button
                    className="icon-btn"
                    disabled={i === prefs.pinned.length - 1}
                    onClick={() => onMovePinned(g, 1)}
                    title="Aşağı taşı"
                  >
                    <IconChevronRight size={13} style={{ transform: 'rotate(90deg)' }} />
                  </button>
                  <button
                    className="icon-btn cat-edit-on"
                    onClick={() => onTogglePinned(g)}
                    title="Sabitlemeyi kaldır"
                  >
                    <IconPin size={13} />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="cat-edit-toolbar">
          <input
            className="cat-edit-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`${groups.length} kategoride ara…`}
          />
          <div className="seg-toggle">
            <button className={!onlyHidden ? 'active' : ''} onClick={() => setOnlyHidden(false)}>
              Tümü
            </button>
            <button className={onlyHidden ? 'active' : ''} onClick={() => setOnlyHidden(true)}>
              Gizlenenler ({prefs.hidden.length})
            </button>
          </div>
        </div>

        <div className="cat-edit-list cat-edit-scroll">
          {rest.length === 0 && <p className="modal-sub">Kategori bulunamadı.</p>}
          {rest.map((g) => {
            const hidden = hiddenSet.has(g.name)
            return (
              <div className={`cat-edit-row ${hidden ? 'is-hidden' : ''}`} key={g.name}>
                <span className="cat-edit-name">{g.name}</span>
                <span className="cat-edit-count">{g.count}</span>
                <button
                  className="icon-btn"
                  onClick={() => onTogglePinned(g.name)}
                  title="Üste sabitle"
                  disabled={hidden}
                >
                  <IconPin size={13} />
                </button>
                <button
                  className={`icon-btn ${hidden ? 'cat-edit-hidden-btn' : ''}`}
                  onClick={() => onToggleHidden(g.name)}
                  title={hidden ? 'Göster' : 'Gizle'}
                >
                  {hidden ? <IconEyeOff size={13} /> : <IconEye size={13} />}
                </button>
              </div>
            )
          })}
        </div>

        <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
          <button
            className="btn-secondary"
            onClick={() => {
              if (confirm('Bu bölümdeki tüm gizleme ve sabitlemeler kaldırılsın mı?')) onReset()
            }}
          >
            Sıfırla
          </button>
          <button className="btn-primary" onClick={onClose}>
            Tamam
          </button>
        </div>
      </div>
    </div>
  )
}
