import { useEffect, useState, type ReactElement } from 'react'
import type { PlayableItem, SubtitleResult, SubtitleSearchParams } from '../../../shared/types'
import type { TrackInfo } from '../lib/playerEngine'
import { cleanTitle, lookupImdb } from '../lib/omdb'
import { effectiveOmdbKey } from '../lib/settings'
import type { SubtitleAppearance } from '../lib/subtitleAppearance'

export interface ExternalSubtitle {
  label: string
  vtt: string
}

interface Props {
  item: PlayableItem
  audioTracks: TrackInfo[]
  subtitleTracks: TrackInfo[]
  currentAudio: number
  currentSubtitle: number
  onAudio: (id: number) => void
  onSubtitle: (id: number) => void
  external: ExternalSubtitle | null
  offset: number
  onLoadExternal: (sub: ExternalSubtitle) => void
  onShift: (seconds: number) => void
  onClearExternal: () => void
  appearance: SubtitleAppearance
  onAppearanceChange: (patch: Partial<SubtitleAppearance>) => void
}

// Oynatıcı ayar panelindeki "Altyazı" sekmesi: yayındaki ses/altyazı
// parçaları ve (film/dizide) internetten Türkçe altyazı bulma.
export function SubtitleTab({
  item,
  audioTracks,
  subtitleTracks,
  currentAudio,
  currentSubtitle,
  onAudio,
  onSubtitle,
  external,
  offset,
  onLoadExternal,
  onShift,
  onClearExternal,
  appearance,
  onAppearanceChange
}: Props): ReactElement {
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [languages, setLanguages] = useState<'tr' | 'tr,en'>('tr')
  const [results, setResults] = useState<SubtitleResult[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    window.iptv.subs.getConfig().then((c) => setConfigured(c.hasApiKey && !!c.username && c.hasPassword))
  }, [])

  async function buildParams(): Promise<SubtitleSearchParams> {
    const hasOmdb = !!effectiveOmdbKey()
    if (item.kind === 'episode' && item.seriesName) {
      let parent = item.seriesImdbId
      if (!parent && hasOmdb) parent = (await lookupImdb([item.seriesName], undefined, 'series').catch(() => null))?.imdbId
      return parent
        ? { parentImdbId: parent, season: item.season, episode: item.episodeNum, languages }
        : { query: cleanTitle(item.seriesName).title, season: item.season, episode: item.episodeNum, languages }
    }
    const { title, year } = cleanTitle(item.name)
    let imdbId = item.imdbId
    if (!imdbId && hasOmdb) imdbId = (await lookupImdb([item.name], year, 'movie').catch(() => null))?.imdbId
    return imdbId ? { imdbId, languages } : { query: title, year, languages }
  }

  async function search(): Promise<void> {
    setBusy(true)
    setMessage(null)
    setResults(null)
    const res = await window.iptv.subs.search(await buildParams())
    setBusy(false)
    if (!res.ok) {
      setMessage(res.error || 'Arama başarısız')
      return
    }
    setResults(res.items || [])
    if (!res.items?.length) setMessage('Bu içerik için altyazı bulunamadı.')
  }

  async function load(r: SubtitleResult): Promise<void> {
    setBusy(true)
    setMessage('Altyazı indiriliyor…')
    const res = await window.iptv.subs.download(r.fileId)
    setBusy(false)
    if (!res.ok || !res.vtt) {
      setMessage(res.error || 'İndirilemedi')
      return
    }
    onLoadExternal({ label: `${r.language.toUpperCase()} · ${r.release}`.slice(0, 80), vtt: res.vtt })
    setMessage(
      res.remaining !== undefined ? `Altyazı yüklendi. Bugün kalan indirme hakkın: ${res.remaining}` : 'Altyazı yüklendi.'
    )
  }

  const hasEmbedded = audioTracks.length > 1 || subtitleTracks.length > 0

  return (
    <div className="settings-body">
      <div className="settings-label">Altyazı görünümü</div>
      <div className="sub-appearance-row">
        <span className="sub-appearance-label">Boyut</span>
        <div className="settings-seg">
          <button className={appearance.size === 'sm' ? 'active' : ''} onClick={() => onAppearanceChange({ size: 'sm' })}>
            Küçük
          </button>
          <button className={appearance.size === 'md' ? 'active' : ''} onClick={() => onAppearanceChange({ size: 'md' })}>
            Orta
          </button>
          <button className={appearance.size === 'lg' ? 'active' : ''} onClick={() => onAppearanceChange({ size: 'lg' })}>
            Büyük
          </button>
        </div>
      </div>
      <div className="sub-appearance-row">
        <span className="sub-appearance-label">Arka plan</span>
        <div className="settings-seg">
          <button
            className={appearance.background === 'none' ? 'active' : ''}
            onClick={() => onAppearanceChange({ background: 'none' })}
            title="Şeffaf — sadece yazı, arka plan kutusu yok"
          >
            Şeffaf
          </button>
          <button
            className={appearance.background === 'soft' ? 'active' : ''}
            onClick={() => onAppearanceChange({ background: 'soft' })}
          >
            Hafif
          </button>
          <button
            className={appearance.background === 'solid' ? 'active' : ''}
            onClick={() => onAppearanceChange({ background: 'solid' })}
          >
            Koyu
          </button>
        </div>
      </div>
      <div className="sub-appearance-row">
        <span className="sub-appearance-label">Renk</span>
        <div className="settings-seg">
          <button className={appearance.color === 'white' ? 'active' : ''} onClick={() => onAppearanceChange({ color: 'white' })}>
            Beyaz
          </button>
          <button className={appearance.color === 'yellow' ? 'active' : ''} onClick={() => onAppearanceChange({ color: 'yellow' })}>
            Sarı
          </button>
        </div>
      </div>
      <div className="sub-preview" />

      {hasEmbedded && (
        <>
          {audioTracks.length > 1 && (
            <>
              <div className="settings-label">Ses dili</div>
              <div className="settings-seg settings-seg-wrap">
                {audioTracks.map((t) => (
                  <button key={t.id} className={currentAudio === t.id ? 'active' : ''} onClick={() => onAudio(t.id)}>
                    {t.label}
                  </button>
                ))}
              </div>
            </>
          )}
          {subtitleTracks.length > 0 && (
            <>
              <div className="settings-label">Yayındaki altyazılar</div>
              <div className="settings-seg settings-seg-wrap">
                <button className={currentSubtitle === -1 ? 'active' : ''} onClick={() => onSubtitle(-1)}>
                  Kapalı
                </button>
                {subtitleTracks.map((t) => (
                  <button
                    key={t.id}
                    className={currentSubtitle === t.id ? 'active' : ''}
                    onClick={() => onSubtitle(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {item.isLive ? (
        !hasEmbedded && <p className="settings-note">Bu kanalda seçilebilir ses dili ya da altyazı yok.</p>
      ) : (
        <>
          <div className="settings-label">İnternetten altyazı</div>
          {external && (
            <div className="sub-active">
              <div className="sub-active-label" title={external.label}>
                ✓ {external.label}
              </div>
              <div className="sub-offset">
                <span>Zamanlama</span>
                <button onClick={() => onShift(-0.5)} title="Altyazı erken geliyorsa: 0,5 sn geciktir">
                  −0,5 sn
                </button>
                <b>{offset > 0 ? `+${offset.toFixed(1)}` : offset.toFixed(1)} sn</b>
                <button onClick={() => onShift(0.5)} title="Altyazı geç geliyorsa: 0,5 sn öne al">
                  +0,5 sn
                </button>
                <button onClick={onClearExternal} title="Bu altyazıyı kapat">
                  Kapat
                </button>
              </div>
            </div>
          )}
          {configured === false ? (
            <p className="settings-note">
              Türkçe altyazıyı internetten bulmak için Ayarlar'a OpenSubtitles bilgilerini gir (ücretsiz hesap).
            </p>
          ) : (
            <>
              <div className="sub-search-row">
                <div className="settings-seg">
                  <button className={languages === 'tr' ? 'active' : ''} onClick={() => setLanguages('tr')}>
                    Türkçe
                  </button>
                  <button className={languages === 'tr,en' ? 'active' : ''} onClick={() => setLanguages('tr,en')}>
                    Türkçe + İngilizce
                  </button>
                </div>
                <button className="btn-primary btn-sm" onClick={() => void search()} disabled={busy}>
                  {busy && !results ? 'Aranıyor…' : 'Altyazı ara'}
                </button>
              </div>
              {message && <p className="settings-note">{message}</p>}
              {results && results.length > 0 && (
                <div className="sub-results">
                  {results.map((r) => (
                    <button key={r.fileId} className="sub-result" onClick={() => void load(r)} disabled={busy}>
                      <span className="sub-result-lang">{r.language.toUpperCase()}</span>
                      <span className="sub-result-name" title={r.release}>
                        {r.release}
                      </span>
                      <span className="sub-result-meta">
                        {r.machine ? 'makine çevirisi · ' : ''}
                        {r.downloads.toLocaleString('tr-TR')} indirme
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
