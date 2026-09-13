import { useState, type ReactElement, type ReactNode } from 'react'
import type { PictureApi, PictureNumberKey } from '../hooks/usePictureSettings'
import type { PictureFit } from '../lib/pictureSettings'
import type { BufferMode } from '../lib/bufferSetting'
import { IconClose } from './Icons'

interface Props {
  isLive: boolean
  picture: PictureApi
  speed: number
  onSpeedChange: (speed: number) => void
  leveling: boolean
  onLevelingChange: (on: boolean) => void
  sleepMinutesLeft: number | null
  onSleepChange: (minutes: number | null) => void
  bufferMode: BufferMode
  onBufferModeChange: (mode: BufferMode) => void
  // Canlı yayında şu an elde tutulan yedek (sn)
  bufferSec?: number
  // "Altyazı" sekmesinin içeriği (ses dili / altyazı / internetten altyazı)
  subtitleContent: ReactNode
  onClose: () => void
}

const BUFFER_OPTIONS: { value: BufferMode; label: string }[] = [
  { value: 'auto', label: 'Otomatik' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'Yüksek' },
  { value: 'max', label: 'En yüksek' }
]

const SLIDERS: { key: PictureNumberKey; label: string; min: number; max: number; unit: string }[] = [
  { key: 'brightness', label: 'Parlaklık', min: 50, max: 150, unit: '%' },
  { key: 'contrast', label: 'Kontrast', min: 50, max: 150, unit: '%' },
  { key: 'saturation', label: 'Renk doygunluğu', min: 0, max: 200, unit: '%' },
  { key: 'warmth', label: 'Sıcaklık', min: 0, max: 40, unit: '' },
  { key: 'hue', label: 'Renk tonu', min: -30, max: 30, unit: '°' }
]

const FITS: { value: PictureFit; label: string }[] = [
  { value: 'contain', label: 'Sığdır' },
  { value: 'cover', label: 'Doldur' },
  { value: 'fill', label: 'Uzat' }
]

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2]
const SLEEP_OPTIONS = [15, 30, 45, 60, 90, 120]

type Tab = 'picture' | 'sound' | 'subtitle' | 'sleep'

export function PlayerSettingsPanel({
  isLive,
  picture,
  speed,
  onSpeedChange,
  leveling,
  onLevelingChange,
  sleepMinutesLeft,
  onSleepChange,
  bufferMode,
  onBufferModeChange,
  bufferSec,
  subtitleContent,
  onClose
}: Props): ReactElement {
  const [tab, setTab] = useState<Tab>('picture')
  const [newName, setNewName] = useState('')

  return (
    <div
      className="settings-panel"
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div className="settings-panel-head">
        <div className="settings-tabs">
          <button className={tab === 'picture' ? 'active' : ''} onClick={() => setTab('picture')}>
            Görüntü
          </button>
          <button className={tab === 'sound' ? 'active' : ''} onClick={() => setTab('sound')}>
            {isLive ? 'Ses ve akış' : 'Ses ve hız'}
          </button>
          <button className={tab === 'subtitle' ? 'active' : ''} onClick={() => setTab('subtitle')}>
            Altyazı
          </button>
          <button className={tab === 'sleep' ? 'active' : ''} onClick={() => setTab('sleep')}>
            Uyku {sleepMinutesLeft !== null && <span className="settings-badge">{sleepMinutesLeft} dk</span>}
          </button>
        </div>
        <button className="icon-btn" onClick={onClose} title="Kapat">
          <IconClose size={12} />
        </button>
      </div>

      {tab === 'picture' && (
        <div className="settings-body">
          <div className="settings-label">Görüntü profili</div>
          <div className="settings-chips">
            {picture.profiles.map((p) => (
              <span key={p.id} className={`settings-chip ${picture.activeId === p.id ? 'active' : ''}`}>
                <button onClick={() => picture.applyProfile(p.id)}>{p.name}</button>
                {!p.builtIn && (
                  <button
                    className="settings-chip-x"
                    onClick={() => picture.deleteProfile(p.id)}
                    title="Profili sil"
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>

          {SLIDERS.map((s) => (
            <label className="settings-slider" key={s.key}>
              <span>{s.label}</span>
              <input
                type="range"
                min={s.min}
                max={s.max}
                value={picture.settings[s.key]}
                onChange={(e) => picture.setValue(s.key, Number(e.target.value))}
              />
              <b>
                {picture.settings[s.key]}
                {s.unit}
              </b>
            </label>
          ))}

          <div className="settings-label">Görüntü boyutu</div>
          <div className="settings-seg">
            {FITS.map((f) => (
              <button
                key={f.value}
                className={picture.settings.fit === f.value ? 'active' : ''}
                onClick={() => picture.setFit(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="settings-save">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Bu ayarları profil olarak kaydet…"
              maxLength={20}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newName.trim()) {
                  picture.saveProfile(newName.trim())
                  setNewName('')
                }
              }}
            />
            <button
              className="btn-primary btn-sm"
              disabled={!newName.trim()}
              onClick={() => {
                picture.saveProfile(newName.trim())
                setNewName('')
              }}
            >
              Kaydet
            </button>
            <button className="btn-secondary btn-sm" onClick={picture.reset}>
              Sıfırla
            </button>
          </div>
        </div>
      )}

      {tab === 'sound' && (
        <div className="settings-body">
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={leveling}
              onChange={(e) => onLevelingChange(e.target.checked)}
            />
            <span>
              <b>Ses seviyesini dengele</b>
              <small>Kanallar arasındaki ve reklamlardaki ani ses farklarını azaltır.</small>
            </span>
          </label>
          {isLive && (
            <>
              <div className="settings-label">Akıcılık tamponu</div>
              <div className="settings-seg">
                {BUFFER_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    className={bufferMode === o.value ? 'active' : ''}
                    onClick={() => onBufferModeChange(o.value)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              <p className="settings-note">
                Tampon büyüdükçe donma azalır; kanal birkaç saniye geç açılır ve yayın canlının
                biraz gerisinden izlenir. Otomatik: 4K kanallarda yüksek, diğerlerinde normal.
                {bufferSec !== undefined && ` Şu an elde: ${Math.round(bufferSec)} sn.`}
              </p>
            </>
          )}
          {!isLive && (
            <>
              <div className="settings-label">Oynatma hızı</div>
              <div className="settings-seg">
                {SPEEDS.map((s) => (
                  <button key={s} className={speed === s ? 'active' : ''} onClick={() => onSpeedChange(s)}>
                    {s === 1 ? 'Normal' : `${s}x`}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'subtitle' && subtitleContent}

      {tab === 'sleep' && (
        <div className="settings-body">
          <p className="settings-note">
            {sleepMinutesLeft !== null
              ? `Oynatma ${sleepMinutesLeft} dakika sonra durdurulacak.`
              : 'Seçtiğin süre dolunca oynatma durur ve yayın kapanır.'}
          </p>
          <div className="settings-seg settings-seg-wrap">
            <button className={sleepMinutesLeft === null ? 'active' : ''} onClick={() => onSleepChange(null)}>
              Kapalı
            </button>
            {SLEEP_OPTIONS.map((m) => (
              <button key={m} onClick={() => onSleepChange(m)}>
                {m} dk
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
