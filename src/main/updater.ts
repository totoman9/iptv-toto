import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import { log } from './log'

// ---------------------------------------------------------------------------
// Otomatik güncelleme
//
// Uygulama, GitHub'daki yayınlarımıza (releases) bakıp yeni bir sürüm varsa
// arka planda indirir; kullanıcı isterse tek tıkla kurup yeniden başlatabilir.
// Geliştirme sırasında (paketlenmemiş uygulamada) hiç çalışmaz.
// ---------------------------------------------------------------------------

const CHECK_INTERVAL_MS = 4 * 3600_000 // 4 saatte bir tekrar kontrol et

let started = false

function send(win: BrowserWindow | null, channel: string, ...args: unknown[]): void {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args)
}

export function initUpdater(getWindow: () => BrowserWindow | null): void {
  if (started || !app.isPackaged) return
  started = true

  autoUpdater.autoDownload = true
  // Kullanıcı bildirimi görmeyip "Şimdi yükle" demese bile, uygulamayı bir
  // dahaki kapatışında indirilen güncelleme kendiliğinden kurulur.
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-downloaded', (info) => {
    send(getWindow(), 'updater:event', { status: 'downloaded', version: info.version })
  })
  autoUpdater.on('error', (err) => {
    // Sessizce günlüğe yaz — internet yoksa ya da GitHub'a ulaşılamıyorsa
    // kullanıcıyı rahatsız etmeye gerek yok.
    void log('warn', 'updater', err?.message || String(err))
  })

  ipcMain.handle('updater:quitAndInstall', () => {
    autoUpdater.quitAndInstall()
  })

  const check = (): void => {
    autoUpdater.checkForUpdates().catch((err) => {
      void log('warn', 'updater', `Kontrol edilemedi: ${err?.message || err}`)
    })
  }

  // Açılışta hemen değil, uygulama kendi yüklenmesini bitirsin diye kısa bir
  // gecikmeyle; sonra düzenli aralıklarla tekrar kontrol et.
  setTimeout(check, 15_000)
  setInterval(check, CHECK_INTERVAL_MS)
}
