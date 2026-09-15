import { app, ipcMain, shell, type BrowserWindow } from 'electron'
import { join } from 'node:path'
import { appendFile, mkdir, rename, stat } from 'node:fs/promises'

// ---------------------------------------------------------------------------
// Hata günlüğü
//
// Bir şey ters giderse ("uygulama açılmadı", "yayın donup kapandı") artık
// tek kanıt kullanıcının ekran görüntüsü değil: ana süreçteki beklenmedik
// hatalar, pencerenin çökmesi/tepkisiz kalması ve ekrandaki (renderer)
// yakalanmamış hatalar burada bir metin dosyasına yazılır. Kullanıcı bir
// sorun bildirdiğinde bu dosyayı isteyip doğrudan inceleyebiliyoruz.
// ---------------------------------------------------------------------------

const MAX_BYTES = 2 * 1024 * 1024 // 2 MB'ı geçince eskisi bir kenara kaldırılır

function logDir(): string {
  return join(app.getPath('userData'), 'logs')
}

function logFile(): string {
  return join(logDir(), 'app.log')
}

async function rotateIfNeeded(): Promise<void> {
  try {
    const s = await stat(logFile())
    if (s.size > MAX_BYTES) {
      await rename(logFile(), join(logDir(), 'app.old.log'))
    }
  } catch {
    /* dosya yok — ilk yazım, sorun değil */
  }
}

function stamp(): string {
  const d = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export type LogLevel = 'info' | 'warn' | 'error'

export async function log(level: LogLevel, scope: string, message: string): Promise<void> {
  try {
    await mkdir(logDir(), { recursive: true })
    await rotateIfNeeded()
    const line = `[${stamp()}] [${level.toUpperCase()}] [${scope}] ${message}\n`
    await appendFile(logFile(), line, 'utf-8')
  } catch {
    // Günlük yazılamadıysa sessizce geç — uygulamanın çalışmasını bozmasın
  }
}

let started = false

// Ana süreçte yakalanmayan hatalar ve pencerenin çökmesi/tepkisiz kalması
export function installCrashLogging(getWindow: () => BrowserWindow | null): void {
  process.on('uncaughtException', (err) => {
    void log('error', 'main:uncaughtException', err?.stack || String(err))
  })
  process.on('unhandledRejection', (reason) => {
    void log(
      'error',
      'main:unhandledRejection',
      reason instanceof Error ? reason.stack || reason.message : String(reason)
    )
  })

  const win = getWindow()
  win?.webContents.on('render-process-gone', (_e, details) => {
    void log('error', 'renderer:gone', `reason=${details.reason} exitCode=${details.exitCode}`)
  })
  win?.webContents.on('unresponsive', () => {
    void log('warn', 'renderer:unresponsive', 'Pencere birkaç saniyedir tepki vermiyor')
  })
  win?.webContents.on('responsive', () => {
    void log('info', 'renderer:responsive', 'Pencere tekrar tepki veriyor')
  })
}

export function initLog(): void {
  if (started) return
  started = true

  // Ekrandaki (renderer) yakalanmamış hatalar da buraya düşer (bkz. main.tsx)
  ipcMain.on('log:error', (_e, scope: string, message: string) => {
    void log('error', scope, message)
  })

  ipcMain.handle('log:openFolder', async () => {
    await mkdir(logDir(), { recursive: true })
    await shell.openPath(logDir())
  })
}
