import { app, BrowserWindow, ipcMain, Menu, nativeImage, Tray } from 'electron'

// ---------------------------------------------------------------------------
// Menü çubuğu (Mac) / sistem tepsisi (Windows) mini kontrolü
//
// Uygulamayı öne getirmeden oynat/duraklat ve kanal değiştirme. Ekrandaki
// oynatıcı (PlayerPane) şu an ne izlendiğini buraya bildirir; buradan
// tıklanan komutlar da ekrana geri gönderilir.
// ---------------------------------------------------------------------------

// Küçük dolu daire (marka rengi) — ayrı bir ikon dosyasına gerek kalmasın
// diye doğrudan gömülü. macOS'ta "template" değil, renkli simge olarak kalır.
const ICON_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAN0lEQVR42mNgoAWosXr7HxumSDNRhhDSjNcQYjVjNYRUzRiGjBpABQMojkaqJCSqJGWqZCZSAQDMV5rIEYuc9gAAAABJRU5ErkJggg=='

export interface TrayStatus {
  title?: string
  isLive?: boolean
  isPlaying?: boolean
}

let tray: Tray | null = null
let status: TrayStatus = {}

function send(win: BrowserWindow | null, command: 'playPause' | 'next' | 'prev'): void {
  win?.webContents.send('tray:command', command)
}

function buildMenu(getWindow: () => BrowserWindow | null): Menu {
  const win = getWindow()
  return Menu.buildFromTemplate([
    { label: status.title || 'IPTV Toto', enabled: false },
    { type: 'separator' },
    {
      label: status.isPlaying ? 'Duraklat' : 'Oynat',
      enabled: !!status.title,
      click: () => send(win, 'playPause')
    },
    {
      label: 'Önceki kanal',
      enabled: !!status.isLive,
      click: () => send(win, 'prev')
    },
    {
      label: 'Sonraki kanal',
      enabled: !!status.isLive,
      click: () => send(win, 'next')
    },
    { type: 'separator' },
    {
      label: 'IPTV Toto\'yu göster',
      click: () => {
        if (!win) return
        win.show()
        win.focus()
      }
    },
    { label: 'Çıkış', role: 'quit' }
  ])
}

let started = false

export function initTray(getWindow: () => BrowserWindow | null): void {
  if (started) return
  started = true

  const icon = nativeImage.createFromDataURL(ICON_DATA_URL)
  tray = new Tray(icon)
  tray.setToolTip('IPTV Toto')
  tray.setContextMenu(buildMenu(getWindow))

  // Simgeye tek tıkla pencereyi göster/gizle (sağ tık zaten menüyü açıyor)
  tray.on('click', () => {
    const win = getWindow()
    if (!win) return
    if (win.isVisible() && win.isFocused()) win.hide()
    else {
      win.show()
      win.focus()
    }
  })

  ipcMain.on('tray:updateStatus', (_e, next: TrayStatus) => {
    status = next
    tray?.setToolTip(next.title ? `IPTV Toto — ${next.title}` : 'IPTV Toto')
    tray?.setContextMenu(buildMenu(getWindow))
  })

  app.on('before-quit', () => {
    tray?.destroy()
    tray = null
  })
}
