import { useMemo, useState, type ReactElement } from 'react'
import type { ParentalLockApi } from '../hooks/useParentalLock'
import { PinPromptModal } from './PinPromptModal'
import { IconLock, IconUnlock } from './Icons'

interface Props {
  api: ParentalLockApi
  allGroups: string[]
  onClose: () => void
}

export function ParentalLockSettingsModal({ api, allGroups, onClose }: Props): ReactElement {
  const [stage, setStage] = useState<'gate' | 'create' | 'manage'>(
    !api.pin ? 'create' : api.sessionUnlocked ? 'manage' : 'gate'
  )
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr')
    if (!q) return allGroups
    return allGroups.filter((g) => g.toLocaleLowerCase('tr').includes(q))
  }, [allGroups, search])

  if (stage === 'gate') {
    return (
      <PinPromptModal
        title="Ebeveyn Kilidi Ayarları"
        onSubmit={(pin) => api.tryUnlock(pin)}
        onSuccess={() => setStage('manage')}
        onCancel={onClose}
      />
    )
  }

  if (stage === 'create') {
    function handleCreate(): void {
      if (newPin.length < 4) {
        setCreateError('PIN en az 4 haneli olmalı')
        return
      }
      if (newPin !== confirmPin) {
        setCreateError('PIN\'ler eşleşmiyor')
        return
      }
      api.setPin(newPin)
      setStage('manage')
    }

    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal modal-pin" onClick={(e) => e.stopPropagation()}>
          <div className="pin-modal-icon">
            <IconLock size={22} />
          </div>
          <h2 style={{ textAlign: 'center' }}>Ebeveyn Kilidi Kur</h2>
          <p className="modal-sub" style={{ textAlign: 'center' }}>
            Kilitlemek istediğin kategoriler için bir PIN belirle.
          </p>
          <div className="field">
            <label>Yeni PIN (en az 4 hane)</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
            />
          </div>
          <div className="field">
            <label>PIN (tekrar)</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
          </div>
          {createError && <div className="field-error">{createError}</div>}
          <div className="modal-actions">
            <button className="btn-secondary" onClick={onClose}>
              Vazgeç
            </button>
            <button className="btn-primary" onClick={handleCreate}>
              PIN Oluştur
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Ebeveyn Kilidi</h2>
        <p className="modal-sub">Kilitlemek istediğin kategorileri işaretle.</p>

        <div className="field">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Kategori ara…"
          />
        </div>

        <div className="lock-group-list">
          {filteredGroups.length === 0 && (
            <p className="modal-sub" style={{ margin: '12px 0' }}>
              Kategori bulunamadı. Önce Canlı TV / Filmler sekmesinde bir kaynak yükle.
            </p>
          )}
          {filteredGroups.map((g) => {
            const locked = api.lockedGroups.includes(g)
            return (
              <button
                key={g}
                className={`lock-group-row ${locked ? 'locked' : ''}`}
                onClick={() => api.toggleGroupLock(g)}
              >
                <span>{g}</span>
                {locked ? <IconLock size={14} /> : <IconUnlock size={14} />}
              </button>
            )
          })}
        </div>

        <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
          <button
            className="btn-danger"
            onClick={() => {
              if (confirm('Ebeveyn kilidi tamamen kaldırılsın mı? Tüm kilitli kategoriler açılır.')) {
                api.clearAll()
                onClose()
              }
            }}
          >
            Kilidi Kaldır
          </button>
          <button className="btn-primary" onClick={onClose}>
            Tamam
          </button>
        </div>
      </div>
    </div>
  )
}
