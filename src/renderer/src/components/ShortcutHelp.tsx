import type { ReactElement } from 'react'
import { IconClose } from './Icons'

const SHORTCUTS: [string, string][] = [
  ['Boşluk / K', 'Oynat / durdur'],
  ['← →', 'Canlıda önceki / sonraki kanal · Filmde 10 sn geri / ileri'],
  ['PageUp / PageDown', 'Önceki / sonraki kanal'],
  ['↑ ↓', 'Sesi aç / kıs'],
  ['M', 'Sesi kapat / aç'],
  ['J', 'Canlı yayında 10 sn geri sar'],
  ['F', 'Tam ekran'],
  ['L', 'Kanal listesi (tam ekranda)'],
  ['C', 'Son 30 saniyeyi kaydet'],
  ['S', 'Ekran görüntüsü al'],
  ['P', 'Resim içinde resim'],
  ['W', 'Mini pencere (her zaman üstte)'],
  ['G', 'Görüntü / ses ayarları'],
  ['?', 'Bu yardım ekranı'],
  ['Esc', 'Kapat / geri']
]

export function ShortcutHelp({ onClose }: { onClose: () => void }): ReactElement {
  return (
    <div className="shortcut-help" onClick={onClose}>
      <div className="shortcut-help-card" onClick={(e) => e.stopPropagation()}>
        <div className="shortcut-help-head">
          <span>Klavye kısayolları</span>
          <button className="icon-btn" onClick={onClose} title="Kapat (Esc)">
            <IconClose size={12} />
          </button>
        </div>
        <div className="shortcut-help-list">
          {SHORTCUTS.map(([key, label]) => (
            <div className="shortcut-row" key={key}>
              <kbd>{key}</kbd>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
