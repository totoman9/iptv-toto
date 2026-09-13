import { useEffect, useRef, useState, type ComponentType, type ReactElement, type ReactNode } from 'react'
import type { SourceConfig } from '../../../shared/types'
import { ACCENTS, type Accent, type Theme } from '../lib/theme'
import {
  IconChevronDown,
  IconGuide,
  IconLibrary,
  IconLiveTv,
  IconLock,
  IconMoon,
  IconMovie,
  IconRecord,
  IconRefresh,
  IconSearch,
  IconSeries,
  IconSettings,
  IconSliders,
  IconStar,
  IconSun
} from './Icons'

export type ViewKey = 'live' | 'vod' | 'series' | 'guide' | 'favorites' | 'recordings'

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

type IconType = ComponentType<{ size?: number }>

const MAIN_TABS: { key: ViewKey; label: string; Icon: IconType; hint: string }[] = [
  { key: 'live', label: 'Canlı TV', Icon: IconLiveTv, hint: 'Canlı kanallar' },
  { key: 'vod', label: 'Filmler', Icon: IconMovie, hint: 'Film arşivi' },
  { key: 'series', label: 'Diziler', Icon: IconSeries, hint: 'Dizi arşivi' },
  { key: 'guide', label: 'Rehber', Icon: IconGuide, hint: 'Şimdi yayında, maç merkezi, program arama, hatırlatıcılar' }
]

const LIBRARY_ITEMS: { key: ViewKey; label: string; Icon: IconType; hint: string }[] = [
  { key: 'favorites', label: 'Favori kanallar', Icon: IconStar, hint: 'Favori kanalların ve klasörlerin' },
  { key: 'recordings', label: 'Kayıtlar', Icon: IconRecord, hint: 'Kaydettiğin ve planladığın programlar' }
]

// Dışarı tıklayınca kapanan açılır menü
function useDropdown(): {
  open: boolean
  setOpen: (v: boolean | ((p: boolean) => boolean)) => void
  ref: React.RefObject<HTMLDivElement | null>
} {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return { open, setOpen, ref }
}

function MenuItem({
  icon,
  children,
  active,
  onClick,
  hint
}: {
  icon?: ReactNode
  children: ReactNode
  active?: boolean
  onClick: () => void
  hint?: string
}): ReactElement {
  return (
    <button className={`menu-item ${active ? 'is-active' : ''}`} onClick={onClick} title={hint}>
      {icon && <span className="menu-item-icon">{icon}</span>}
      <span className="menu-item-label">{children}</span>
    </button>
  )
}

function LibraryMenu({
  view,
  onViewChange,
  recordingActive
}: Pick<Props, 'view' | 'onViewChange' | 'recordingActive'>): ReactElement {
  const { open, setOpen, ref } = useDropdown()
  const current = LIBRARY_ITEMS.find((i) => i.key === view)
  return (
    <div className="dropdown-wrap" ref={ref}>
      <button
        className={`topnav-tab ${current ? 'active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title="Kitaplığım: favori kanallar, kayıtlar"
      >
        <IconLibrary size={16} /> Kitaplığım
        {recordingActive && <span className="tab-rec-dot" />}
        <IconChevronDown size={13} />
      </button>
      {open && (
        <div className="dropdown-menu dropdown-left">
          {LIBRARY_ITEMS.map((i) => (
            <MenuItem
              key={i.key}
              icon={<i.Icon size={15} />}
              active={view === i.key}
              hint={i.hint}
              onClick={() => {
                onViewChange(i.key)
                setOpen(false)
              }}
            >
              {i.label}
              {i.key === 'recordings' && recordingActive && <span className="menu-rec">kaydediliyor</span>}
            </MenuItem>
          ))}
        </div>
      )}
    </div>
  )
}

function AccountMenu(props: Props): ReactElement {
  const {
    sources,
    activeSourceId,
    onSourceChange,
    onManageSources,
    onReload,
    loading,
    theme,
    onThemeChange,
    accent,
    onAccentChange,
    onOpenSettings,
    onOpenParentalLock
  } = props
  const { open, setOpen, ref } = useDropdown()
  const active = sources.find((s) => s.id === activeSourceId)
  const close = (fn: () => void) => () => {
    fn()
    setOpen(false)
  }

  return (
    <div className="dropdown-wrap" ref={ref}>
      <button
        className={`account-btn ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title="Kaynak, görünüm ve ayarlar"
      >
        <span className={`account-avatar ${loading ? 'is-loading' : ''}`}>
          {(active?.name || 'T').slice(0, 1).toUpperCase()}
        </span>
        <span className="account-name">{active?.name || 'Kaynak ekle'}</span>
        <IconChevronDown size={13} />
      </button>
      {open && (
        <div className="dropdown-menu dropdown-right account-menu">
          <div className="menu-label">Kaynak</div>
          {sources.map((s) => (
            <MenuItem
              key={s.id}
              icon={<span className={`menu-radio ${s.id === activeSourceId ? 'on' : ''}`} />}
              active={s.id === activeSourceId}
              onClick={close(() => onSourceChange(s.id))}
            >
              {s.name}
            </MenuItem>
          ))}
          <MenuItem icon={<IconSettings size={14} />} onClick={close(onManageSources)} hint="Kaynak ekle, düzenle, sil">
            Kaynakları yönet…
          </MenuItem>
          <MenuItem
            icon={<IconRefresh size={14} />}
            onClick={close(onReload)}
            hint="Kanal, film ve dizi listesini sunucudan yeniden al"
          >
            Listeyi yenile{loading ? ' (yükleniyor…)' : ''}
          </MenuItem>

          <div className="menu-sep" />
          <div className="menu-label">Görünüm</div>
          <div className="seg-toggle menu-seg">
            <button className={theme === 'light' ? 'active' : ''} onClick={() => onThemeChange('light')}>
              <IconSun size={13} /> Açık
            </button>
            <button className={theme === 'dark' ? 'active' : ''} onClick={() => onThemeChange('dark')}>
              <IconMoon size={13} /> Koyu
            </button>
          </div>
          <div className="appearance-swatches menu-swatches">
            {ACCENTS.map((a) => (
              <button
                key={a.id}
                className={`swatch ${accent === a.id ? 'active' : ''}`}
                style={{ background: a.color }}
                onClick={() => onAccentChange(a.id)}
                title={`Renk: ${a.label}`}
              />
            ))}
          </div>

          <div className="menu-sep" />
          <MenuItem icon={<IconSliders size={14} />} onClick={close(onOpenSettings)} hint="IMDb ve altyazı hesapları">
            Ayarlar…
          </MenuItem>
          <MenuItem icon={<IconLock size={14} />} onClick={close(onOpenParentalLock)} hint="Kategorileri PIN ile kilitle">
            Ebeveyn kilidi…
          </MenuItem>
        </div>
      )}
    </div>
  )
}

export function TopNav(props: Props): ReactElement {
  const { view, onViewChange, onOpenSearch, recordingActive } = props
  const shortcut = window.iptv?.platform === 'darwin' ? '⌘K' : 'Ctrl K'
  return (
    <div className="topnav">
      <div className="topnav-brand">
        <div className="brand-mark">T</div>
        <span className="brand-name">IPTV Toto</span>
      </div>

      <div className="topnav-tabs">
        {MAIN_TABS.map((tab) => (
          <button
            key={tab.key}
            className={`topnav-tab ${view === tab.key ? 'active' : ''}`}
            onClick={() => onViewChange(tab.key)}
            title={tab.hint}
          >
            <tab.Icon size={16} /> {tab.label}
          </button>
        ))}
        <LibraryMenu view={view} onViewChange={onViewChange} recordingActive={recordingActive} />
      </div>

      <div className="topnav-spacer" />

      <button className="topnav-search" onClick={onOpenSearch} title="Kanal, film, dizi ve program ara">
        <IconSearch size={14} />
        <span>Ara…</span>
        <kbd>{shortcut}</kbd>
      </button>

      <AccountMenu {...props} />
    </div>
  )
}
