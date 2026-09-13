import { useEffect, useRef, useState, type ComponentType, type ReactElement } from 'react'
import type { SourceConfig } from '../../../shared/types'
import { ACCENTS, type Accent, type Theme } from '../lib/theme'
import {
  IconGuide,
  IconLiveTv,
  IconLock,
  IconMoon,
  IconMovie,
  IconPalette,
  IconRecord,
  IconRefresh,
  IconSearch,
  IconSeries,
  IconSettings,
  IconSliders,
  IconStar,
  IconSun
} from './Icons'

export type ViewKey = 'live' | 'vod' | 'series' | 'favorites' | 'guide' | 'recordings'

interface Props {
  view: ViewKey
  onViewChange: (v: ViewKey) => void
  sources: SourceConfig[]
  activeSourceId: string | null
  onSourceChange: (id: string) => void
  onManageSources: () => void
  onOpenParentalLock: () => void
  onReload: () => void
  loading: boolean
  theme: Theme
  onThemeChange: (theme: Theme) => void
  accent: Accent
  onAccentChange: (accent: Accent) => void
  onOpenSearch: () => void
  onOpenSettings: () => void
  recordingActive: boolean
}

const TABS: { key: ViewKey; label: string; Icon: ComponentType<{ size?: number }> }[] = [
  { key: 'live', label: 'Canlı TV', Icon: IconLiveTv },
  { key: 'vod', label: 'Filmler', Icon: IconMovie },
  { key: 'series', label: 'Diziler', Icon: IconSeries },
  { key: 'favorites', label: 'Favoriler', Icon: IconStar },
  { key: 'guide', label: 'Rehber', Icon: IconGuide },
  { key: 'recordings', label: 'Kayıtlar', Icon: IconRecord }
]

function AppearanceMenu({
  theme,
  onThemeChange,
  accent,
  onAccentChange
}: Pick<Props, 'theme' | 'onThemeChange' | 'accent' | 'onAccentChange'>): ReactElement {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div className="appearance-wrap" ref={ref}>
      <button
        className={`icon-btn ${open ? 'icon-btn-on' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title="Görünüm: tema ve renk"
      >
        <IconPalette size={15} />
      </button>
      {open && (
        <div className="appearance-menu">
          <div className="appearance-label">Tema</div>
          <div className="seg-toggle appearance-seg">
            <button className={theme === 'light' ? 'active' : ''} onClick={() => onThemeChange('light')}>
              <IconSun size={13} /> Açık
            </button>
            <button className={theme === 'dark' ? 'active' : ''} onClick={() => onThemeChange('dark')}>
              <IconMoon size={13} /> Koyu
            </button>
          </div>
          <div className="appearance-label">Renk</div>
          <div className="appearance-swatches">
            {ACCENTS.map((a) => (
              <button
                key={a.id}
                className={`swatch ${accent === a.id ? 'active' : ''}`}
                style={{ background: a.color }}
                onClick={() => onAccentChange(a.id)}
                title={a.label}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function TopNav({
  view,
  onViewChange,
  sources,
  activeSourceId,
  onSourceChange,
  onManageSources,
  onOpenParentalLock,
  onReload,
  loading,
  theme,
  onThemeChange,
  accent,
  onAccentChange,
  onOpenSearch,
  onOpenSettings,
  recordingActive
}: Props): ReactElement {
  const shortcut = window.iptv?.platform === 'darwin' ? '⌘K' : 'Ctrl K'
  return (
    <div className="topnav">
      <div className="topnav-brand">
        <div className="brand-mark">T</div>
        <span className="brand-name">IPTV Toto</span>
      </div>

      <div className="topnav-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={`topnav-tab ${view === tab.key ? 'active' : ''}`}
            onClick={() => onViewChange(tab.key)}
          >
            <tab.Icon size={16} /> {tab.label}
            {tab.key === 'recordings' && recordingActive && <span className="tab-rec-dot" title="Kayıt sürüyor" />}
          </button>
        ))}
      </div>

      <div className="topnav-spacer" />

      <button className="topnav-search" onClick={onOpenSearch} title="Her yerde ara">
        <IconSearch size={14} />
        <span>Ara</span>
        <kbd>{shortcut}</kbd>
      </button>

      {sources.length > 0 && (
        <select
          className="source-select topnav-source-select"
          value={activeSourceId || ''}
          onChange={(e) => onSourceChange(e.target.value)}
        >
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}

      <AppearanceMenu
        theme={theme}
        onThemeChange={onThemeChange}
        accent={accent}
        onAccentChange={onAccentChange}
      />
      <button className="icon-btn" onClick={onOpenSettings} title="Ayarlar (IMDb puanları vb.)">
        <IconSliders size={15} />
      </button>
      <button className="icon-btn" onClick={onOpenParentalLock} title="Ebeveyn Kilidi">
        <IconLock size={14} />
      </button>
      <button
        className={`icon-btn ${loading ? 'icon-btn-spinning' : ''}`}
        onClick={onReload}
        title="Listeyi yenile"
      >
        <IconRefresh size={15} />
      </button>
      <button className="btn-primary topnav-add-btn" onClick={onManageSources}>
        <IconSettings size={14} /> Kaynaklar
      </button>
    </div>
  )
}
