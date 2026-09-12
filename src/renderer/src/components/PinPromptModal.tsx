import { useState, type ReactElement } from 'react'
import { IconLock } from './Icons'

interface Props {
  title?: string
  onSubmit: (pin: string) => boolean
  onSuccess: () => void
  onCancel: () => void
}

export function PinPromptModal({ title, onSubmit, onSuccess, onCancel }: Props): ReactElement {
  const [value, setValue] = useState('')
  const [error, setError] = useState(false)

  function handleSubmit(): void {
    if (onSubmit(value)) {
      onSuccess()
    } else {
      setError(true)
      setValue('')
    }
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal modal-pin" onClick={(e) => e.stopPropagation()}>
        <div className="pin-modal-icon">
          <IconLock size={22} />
        </div>
        <h2 style={{ textAlign: 'center' }}>{title || 'Kilitli içerik'}</h2>
        <p className="modal-sub" style={{ textAlign: 'center' }}>
          Devam etmek için PIN kodunu gir.
        </p>
        <input
          type="password"
          inputMode="numeric"
          maxLength={6}
          autoFocus
          className="pin-input"
          value={value}
          onChange={(e) => {
            setValue(e.target.value.replace(/\D/g, ''))
            setError(false)
          }}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        />
        {error && <div className="field-error" style={{ textAlign: 'center' }}>Yanlış PIN</div>}
        <div className="modal-actions" style={{ justifyContent: 'center' }}>
          <button className="btn-secondary" onClick={onCancel}>
            Vazgeç
          </button>
          <button className="btn-primary" onClick={handleSubmit} disabled={value.length < 4}>
            Onayla
          </button>
        </div>
      </div>
    </div>
  )
}
