import { useState, type ReactElement } from 'react'
import type { SourceConfig } from '../../../shared/types'
import { testXtreamLogin } from '../lib/xtream'

interface Props {
  onClose: () => void
  onAdd: (source: SourceConfig) => void
}

export function AddSourceModal({ onClose, onAdd }: Props): ReactElement {
  const [tab, setTab] = useState<'m3u' | 'xtream'>('m3u')
  const [name, setName] = useState('')
  const [m3uUrl, setM3uUrl] = useState('')
  const [host, setHost] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  async function handleSubmit(): Promise<void> {
    setError(null)

    if (tab === 'm3u') {
      if (!m3uUrl.trim()) {
        setError('Lütfen bir M3U linki girin')
        return
      }
      onAdd({
        type: 'm3u',
        id: `m3u-${Date.now()}`,
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
      id: `xtream-${Date.now()}`,
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
        <h2>Kaynak Ekle</h2>
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
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </>
        )}

        {error && <div className="field-error">{error}</div>}

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn-primary" onClick={handleSubmit} disabled={checking}>
            {checking ? 'Kontrol ediliyor…' : 'Ekle ve Bağlan'}
          </button>
        </div>
      </div>
    </div>
  )
}
