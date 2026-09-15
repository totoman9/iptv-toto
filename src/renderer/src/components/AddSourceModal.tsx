import { useState, type ReactElement } from 'react'
import type { SourceConfig } from '../../../shared/types'
import { testXtreamLogin } from '../lib/xtream'
import { IconEye, IconEyeOff } from './Icons'

interface Props {
  onClose: () => void
  onAdd: (source: SourceConfig) => void
  // Verilirse pencere "düzenleme" moduna geçer: alanlar bu kaynaktan
  // doldurulur, kaydedince aynı id ile güncellenir.
  editing?: SourceConfig
}

export function AddSourceModal({ onClose, onAdd, editing }: Props): ReactElement {
  const [tab, setTab] = useState<'m3u' | 'xtream'>(editing?.type === 'xtream' ? 'xtream' : 'm3u')
  const [name, setName] = useState(editing?.name || '')
  const [m3uUrl, setM3uUrl] = useState(editing?.type === 'm3u' ? editing.url : '')
  const [host, setHost] = useState(editing?.type === 'xtream' ? editing.host : '')
  const [username, setUsername] = useState(editing?.type === 'xtream' ? editing.username : '')
  const [password, setPassword] = useState(editing?.type === 'xtream' ? editing.password : '')
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  async function handleSubmit(): Promise<void> {
    setError(null)

    if (tab === 'm3u') {
      if (!m3uUrl.trim()) {
        setError('Lütfen bir M3U linki girin')
        return
      }
      onAdd({
        type: 'm3u',
        id: editing?.id || `m3u-${Date.now()}`,
        name: name.trim() || 'M3U Listem',
        url: m3uUrl.trim()
      })
      return
    }

    if (!host.trim() || !username.trim() || !password.trim()) {
      setError('Sunucu adresi, kullanıcı adı ve şifre gerekli')
      return
    }

    const cfg: SourceConfig = {
      type: 'xtream',
      id: editing?.id || `xtream-${Date.now()}`,
      name: name.trim() || 'Xtream Hesabım',
      host: host.trim(),
      username: username.trim(),
      password: password.trim()
    }

    setChecking(true)
    const result = await testXtreamLogin(cfg)
    setChecking(false)

    if (!result.ok) {
      setError(result.error || 'Bağlantı doğrulanamadı')
      return
    }

    onAdd({ ...cfg, liveExtension: result.liveExtension })
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{editing ? 'Kaynağı Düzenle' : 'Kaynak Ekle'}</h2>
        <p className="modal-sub">M3U linki ya da Xtream Codes hesabınla bağlan.</p>

        <div className="tab-row">
          <button className={tab === 'm3u' ? 'active' : ''} onClick={() => setTab('m3u')}>
            M3U Link
          </button>
          <button className={tab === 'xtream' ? 'active' : ''} onClick={() => setTab('xtream')}>
            Xtream Codes
          </button>
        </div>

        <div className="field">
          <label>Bu kaynağa bir isim ver (isteğe bağlı)</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={tab === 'm3u' ? 'Örn: Ana Listem' : 'Örn: Ana Hesabım'}
          />
        </div>

        {tab === 'm3u' ? (
          <div className="field">
            <label>M3U Linki</label>
            <input
              value={m3uUrl}
              onChange={(e) => setM3uUrl(e.target.value)}
              placeholder="http://ornek.com/liste.m3u"
            />
          </div>
        ) : (
          <>
            <div className="field">
              <label>Sunucu Adresi</label>
              <input
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="http://sunucu.com:8080"
              />
            </div>
            <div className="field">
              <label>Kullanıcı Adı</label>
              <input value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>
            <div className="field">
              <label>Şifre</label>
              <div className="password-input-row">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="icon-btn password-toggle"
                  onClick={() => setShowPassword((v) => !v)}
                  title={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                >
                  {showPassword ? <IconEyeOff size={15} /> : <IconEye size={15} />}
                </button>
              </div>
            </div>
          </>
        )}

        {error && <div className="field-error">{error}</div>}

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn-primary" onClick={handleSubmit} disabled={checking}>
            {checking ? 'Kontrol ediliyor…' : editing ? 'Kaydet' : 'Ekle ve Bağlan'}
          </button>
        </div>
      </div>
    </div>
  )
}
