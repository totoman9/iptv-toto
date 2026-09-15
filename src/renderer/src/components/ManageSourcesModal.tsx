import { useState, type ReactElement } from 'react'
import type { SourceConfig } from '../../../shared/types'
import { AddSourceModal } from './AddSourceModal'
import { IconEdit, IconPlus, IconTrash } from './Icons'

interface Props {
  sources: SourceConfig[]
  onClose: () => void
  onAdd: (source: SourceConfig) => void
  onUpdate: (id: string, source: SourceConfig) => void
  onRemove: (id: string) => void
}

export function ManageSourcesModal({
  sources,
  onClose,
  onAdd,
  onUpdate,
  onRemove
}: Props): ReactElement {
  // Hiç kaynak yoksa boş "Kaynaklarım" listesini göstermeden doğrudan
  // ekleme formuna geç — ilk kurulumda bir tıklama daha az.
  const [editing, setEditing] = useState<SourceConfig | 'new' | null>(sources.length === 0 ? 'new' : null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  if (editing) {
    return (
      <AddSourceModal
        editing={editing === 'new' ? undefined : editing}
        isFirstSource={editing === 'new' && sources.length === 0}
        onClose={() => (sources.length === 0 ? onClose() : setEditing(null))}
        onAdd={(source) => {
          if (editing === 'new') onAdd(source)
          else onUpdate(source.id, source)
          setEditing(null)
        }}
      />
    )
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Kaynaklarım</h2>
        <p className="modal-sub">Kaynaklarını düzenle, sil ya da yenisini ekle.</p>

        <div className="source-manage-list">
          {sources.length === 0 && (
            <p className="modal-sub" style={{ margin: '18px 0' }}>
              Henüz kaynak eklemedin.
            </p>
          )}
          {sources.map((s) => (
            <div className="source-manage-row" key={s.id}>
              <div className="source-manage-info">
                <div className="source-manage-name">{s.name}</div>
                <div className="source-manage-type">
                  {s.type === 'm3u' ? 'M3U Link' : 'Xtream Codes'}
                </div>
              </div>
              {confirmDeleteId === s.id ? (
                <div className="source-manage-confirm">
                  <span>Silinsin mi?</span>
                  <button
                    className="btn-secondary source-manage-btn-sm"
                    onClick={() => setConfirmDeleteId(null)}
                  >
                    Vazgeç
                  </button>
                  <button
                    className="btn-danger source-manage-btn-sm"
                    onClick={() => {
                      onRemove(s.id)
                      setConfirmDeleteId(null)
                    }}
                  >
                    Sil
                  </button>
                </div>
              ) : (
                <div className="source-manage-actions">
                  <button
                    className="icon-btn"
                    onClick={() => setEditing(s)}
                    title="Düzenle"
                  >
                    <IconEdit size={14} />
                  </button>
                  <button
                    className="icon-btn"
                    onClick={() => setConfirmDeleteId(s.id)}
                    title="Sil"
                  >
                    <IconTrash size={14} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
          <button className="btn-secondary" onClick={() => setEditing('new')}>
            <IconPlus size={13} /> Yeni Kaynak
          </button>
          <button className="btn-primary" onClick={onClose}>
            Tamam
          </button>
        </div>
      </div>
    </div>
  )
}
