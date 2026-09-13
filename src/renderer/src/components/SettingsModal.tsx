import { useState, type ReactElement } from 'react'
import { updateSettings } from '../lib/settings'
import { testOmdbKey } from '../lib/omdb'
import { useSettings } from '../hooks/useSettings'

export function SettingsModal({ onClose }: { onClose: () => void }): ReactElement {
  const settings = useSettings()
  const [omdbKey, setOmdbKey] = useState(settings.omdbKey || '')
  const [status, setStatus] = useState<{ kind: 'ok' | 'error' | 'busy'; text: string } | null>(null)

  async function saveOmdb(): Promise<void> {
    const key = omdbKey.trim()
    if (!key) {
      updateSettings({ omdbKey: undefined })
      setStatus({ kind: 'ok', text: 'Anahtar kaldırıldı.' })
      return
    }
    setStatus({ kind: 'busy', text: 'Anahtar deneniyor…' })
    const res = await testOmdbKey(key)
    if (res.ok) {
      updateSettings({ omdbKey: key })
      setStatus({ kind: 'ok', text: 'Anahtar çalışıyor, kaydedildi. Film ve dizi sayfalarında IMDb puanları görünecek.' })
    } else {
      setStatus({ kind: 'error', text: res.error || 'Anahtar doğrulanamadı' })
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Ayarlar</h2>

        <section className="settings-section">
          <div className="settings-section-title">IMDb puanları</div>
          <p className="modal-sub">
            Film ve dizi sayfalarında IMDb puanını, dizilerde her bölümün puanını göstermek için ücretsiz
            bir OMDb anahtarı gerekir.{' '}
            <a href="https://www.omdbapi.com/apikey.aspx" target="_blank" rel="noreferrer">
              Anahtar al (omdbapi.com)
            </a>{' '}
            — “FREE” seçeneğini işaretle, e-postana gelen etkinleştirme linkine tıklamayı unutma.
          </p>
          <div className="field">
            <label>OMDb anahtarı</label>
            <div className="settings-inline">
              <input
                value={omdbKey}
                onChange={(e) => setOmdbKey(e.target.value)}
                placeholder="ör. a1b2c3d4"
                spellCheck={false}
                onKeyDown={(e) => e.key === 'Enter' && void saveOmdb()}
              />
              <button className="btn-primary" onClick={() => void saveOmdb()} disabled={status?.kind === 'busy'}>
                Kaydet ve dene
              </button>
            </div>
          </div>
          {status && <div className={`settings-status settings-status-${status.kind}`}>{status.text}</div>}
        </section>

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>
            Kapat
          </button>
        </div>
      </div>
    </div>
  )
}
