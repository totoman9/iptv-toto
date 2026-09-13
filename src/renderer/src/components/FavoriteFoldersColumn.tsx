import { useState, type ReactElement } from 'react'
import type { FavoriteFolder } from '../lib/storage'
import { IconEdit, IconFolder, IconPlus, IconTrash } from './Icons'

interface Props {
  folders: FavoriteFolder[]
  allCount: number
  activeFolder: string | null
  onSelect: (id: string | null) => void
  onCreate: (name: string) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
}

export function FavoriteFoldersColumn({
  folders,
  allCount,
  activeFolder,
  onSelect,
  onCreate,
  onRename,
  onDelete
}: Props): ReactElement {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  function commitCreate(): void {
    if (newName.trim()) onCreate(newName.trim())
    setCreating(false)
    setNewName('')
  }

  function commitRename(): void {
    if (editingId && editName.trim()) onRename(editingId, editName.trim())
    setEditingId(null)
  }

  return (
    <div className="pane pane-categories folder-column">
      <div className="folder-column-head">
        <span>Klasörler</span>
        <button
          className="icon-btn"
          onClick={() => {
            setCreating(true)
            setNewName('')
          }}
          title="Yeni klasör"
        >
          <IconPlus size={14} />
        </button>
      </div>

      <div className="pane-list category-list">
        <div
          className={`category-row ${activeFolder === null ? 'active' : ''}`}
          onClick={() => onSelect(null)}
        >
          <span className="category-row-label">Tüm favoriler</span>
          <span className="category-count">{allCount}</span>
        </div>

        {folders.map((f) =>
          editingId === f.id ? (
            <div className="category-row" key={f.id}>
              <input
                className="folder-name-input"
                autoFocus
                value={editName}
                maxLength={30}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename()
                  if (e.key === 'Escape') setEditingId(null)
                }}
                onBlur={commitRename}
              />
            </div>
          ) : (
            <div
              key={f.id}
              className={`category-row folder-row ${activeFolder === f.id ? 'active' : ''}`}
              onClick={() => onSelect(f.id)}
            >
              <IconFolder size={13} className="folder-icon" />
              <span className="category-row-label">{f.name}</span>
              <span className="folder-actions">
                <button
                  title="Yeniden adlandır"
                  onClick={(e) => {
                    e.stopPropagation()
                    setEditingId(f.id)
                    setEditName(f.name)
                  }}
                >
                  <IconEdit size={12} />
                </button>
                <button
                  title="Klasörü sil"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (confirm(`“${f.name}” klasörü silinsin mi? Kanallar favorilerde kalır.`)) {
                      onDelete(f.id)
                    }
                  }}
                >
                  <IconTrash size={12} />
                </button>
              </span>
              <span className="category-count">{f.channelIds.length}</span>
            </div>
          )
        )}

        {creating && (
          <div className="category-row">
            <input
              className="folder-name-input"
              autoFocus
              placeholder="Klasör adı (ör. Spor)"
              value={newName}
              maxLength={30}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitCreate()
                if (e.key === 'Escape') setCreating(false)
              }}
              onBlur={commitCreate}
            />
          </div>
        )}
      </div>

      {folders.length === 0 && !creating && (
        <p className="folder-hint">
          Kanallarını “Spor”, “Haber”, “Çocuk” gibi klasörlere ayırmak için + ile klasör oluştur,
          sonra kanalın yanındaki klasör simgesine tıkla.
        </p>
      )}
    </div>
  )
}
