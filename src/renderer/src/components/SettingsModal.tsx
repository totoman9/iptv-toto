import { useEffect, useState, type ReactElement } from 'react'
import { updateSettings } from '../lib/settings'
import { testOmdbKey } from '../lib/omdb'
import { useSettings } from '../hooks/useSettings'
import { IconEye, IconEyeOff } from './Icons'

export function SettingsModal({ onClose }: { onClose: () => void }): ReactElement {
  const settings = useSettings()
  const [omdbKey, setOmdbKey] = useState(settings.omdbKey || '')
  const [status, setStatus] = useState<{ kind: 'ok' | 'error' | 'busy'; text: string } | null>(null)

  // OpenSubtitles: şifre arayüze hiç geri gelmez, yalnızca "kayıtlı" bilgisi
  const [osConfig, setOsConfig] = useState<{ hasApiKey: boolean; username: string; hasPassword: boolean } | null>(null)
  const [osKey, setOsKey] = useState('')
  const [osUser, setOsUser] = useState('')
  const [osPass, setOsPass] = useState('')
  const [osStatus, setOsStatus] = useState<{ kind: 'ok' | 'error' | 'busy'; text: string } | null>(null)
  const [showOsPass, setShowOsPass] = useState(false)

  useEffect(() => {
    window.iptv.subs.getConfig().then((c) => {
      setOsConfig(c)
      setOsUser(c.username)
    })
  }, [])

  async function saveOs(): Promise<void> {
    setOsStatus({ kind: 'busy', text: 'Giriş deneniyor…' })
    await window.iptv.subs.saveConfig({
      apiKey: osKey || undefined,
      username: osUser || undefined,
      password: osPass || undefined
    })
    setOsPass('')
    setOsKey('')
    const res = await window.iptv.subs.test()
    setOsConfig(await window.iptv.subs.getConfig())
    setOsStatus(
      res.ok
        ? {
            kind: 'ok',
            text: `Bağlantı tamam.${res.remaining !== undefined ? ` Bugün kalan indirme hakkın: ${res.remaining}.` : ''} Film/dizi oynatırken Ayarlar › Altyazı'dan arayabilirsin.`
          }
        : { kind: 'error', text: res.error || 'Giriş yapılamadı' }
    )
  }

  async function clearOs(): Promise<void> {
    await window.iptv.subs.saveConfig({ clear: true })
    setOsConfig(await window.iptv.subs.getConfig())
    setOsUser('')
    setOsStatus({ kind: 'ok', text: 'OpenSubtitles bilgileri silindi.' })
  }

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
            IMDb puanları uygulamayla gelen anahtarla hazır çalışır. Günlük sınır dolarsa kendi ücretsiz
            anahtarını alıp buraya yazabilirsin.{' '}
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
                placeholder="Boş bırakırsan uygulamanın anahtarı kullanılır"
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

        <section className="settings-section">
          <div className="settings-section-title">“Top 10” sıralaması</div>
          <p className="modal-sub">
            Film ve dizi vitrinindeki “Bugün 10 numara” satırı neye göre sıralansın? Sağlayıcı puanı anında
            gelir; IMDb puanı daha isabetlidir ama ilk seferde birkaç saniye sürer (sonra hatırlanır).
          </p>
          <div className="seg-toggle" style={{ alignSelf: 'flex-start', width: 'fit-content' }}>
            <button
              className={(settings.top10Source ?? 'provider') === 'provider' ? 'active' : ''}
              onClick={() => updateSettings({ top10Source: 'provider' })}
            >
              Sağlayıcı puanı
            </button>
            <button
              className={settings.top10Source === 'imdb' ? 'active' : ''}
              onClick={() => updateSettings({ top10Source: 'imdb' })}
            >
              IMDb puanı
            </button>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-title">İnternetten altyazı (OpenSubtitles)</div>
          <p className="modal-sub">
            Filmde/dizide altyazı yoksa Türkçe altyazıyı internetten bulup ekler. Ücretsiz hesap açıp{' '}
            <a href="https://www.opensubtitles.com/consumers" target="_blank" rel="noreferrer">
              API anahtarı al
            </a>
            . Bilgilerin bu bilgisayarda şifreli saklanır.
          </p>
          <div className="field">
            <label>API anahtarı</label>
            <input
              value={osKey}
              onChange={(e) => setOsKey(e.target.value)}
              placeholder={osConfig?.hasApiKey ? 'Kayıtlı (değiştirmek için yenisini yaz)' : 'OpenSubtitles API key'}
              spellCheck={false}
            />
          </div>
          <div className="settings-inline">
            <div className="field" style={{ flex: 1 }}>
              <label>Kullanıcı adı</label>
              <input value={osUser} onChange={(e) => setOsUser(e.target.value)} spellCheck={false} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>Şifre</label>
              <div className="password-input-row">
                <input
                  type={showOsPass ? 'text' : 'password'}
                  value={osPass}
                  onChange={(e) => setOsPass(e.target.value)}
                  placeholder={osConfig?.hasPassword ? 'Kayıtlı' : ''}
                />
                <button
                  type="button"
                  className="icon-btn password-toggle"
                  onClick={() => setShowOsPass((v) => !v)}
                  title={showOsPass ? 'Şifreyi gizle' : 'Şifreyi göster'}
                >
                  {showOsPass ? <IconEyeOff size={15} /> : <IconEye size={15} />}
                </button>
              </div>
            </div>
          </div>
          <div className="settings-inline">
            <button className="btn-primary" onClick={() => void saveOs()} disabled={osStatus?.kind === 'busy'}>
              Kaydet ve dene
            </button>
            {(osConfig?.hasApiKey || osConfig?.hasPassword) && (
              <button className="btn-secondary" onClick={() => void clearOs()}>
                Bilgileri sil
              </button>
            )}
          </div>
          {osStatus && <div className={`settings-status settings-status-${osStatus.kind}`}>{osStatus.text}</div>}
        </section>

        <section className="settings-section">
          <div className="settings-section-title">Sorun bildirme</div>
          <p className="modal-sub">
            Uygulama donduğunda ya da beklenmedik bir hata verdiğinde buraya kaydedilir. Bir sorun
            yaşadığında bu dosyayı bana gönderebilirsin.
          </p>
          <div className="settings-inline">
            <button className="btn-secondary" onClick={() => void window.iptv.log.openFolder()}>
              Hata günlüğünü aç
            </button>
          </div>
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
