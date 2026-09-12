import { app, shell, BrowserWindow, ipcMain, session } from 'electron'
import { join } from 'node:path'
import { writeFile, readFile, mkdir } from 'node:fs/promises'

const isMac = process.platform === 'darwin'

function getUserDataPath(fileName: string): string {
  return join(app.getPath('userData'), fileName)
}

async function ensureUserDataDir(): Promise<void> {
  await mkdir(app.getPath('userData'), { recursive: true })
}

// Basit JSON tabanlı depolama (kaynaklar, favoriler, ayarlar)
ipcMain.handle('store:read', async (_event, key: string) => {
  try {
    const raw = await readFile(getUserDataPath(`${key}.json`), 'utf-8')
    return JSON.parse(raw)
  } catch {
    return null
  }
})

ipcMain.handle('store:write', async (_event, key: string, value: unknown) => {
  await ensureUserDataDir()
  await writeFile(getUserDataPath(`${key}.json`), JSON.stringify(value, null, 2), 'utf-8')
  return true
})

// Renderer'dan CORS kısıtlaması olmadan HTTP istekleri (M3U indirme, Xtream API)
ipcMain.handle(
  'http:fetchText',
  async (_event, url: string, options?: { timeoutMs?: number }) => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), options?.timeoutMs ?? 20000)
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (IPTV-App)' }
      })
      const text = await res.text()
      return { ok: res.ok, status: res.status, data: text }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    } finally {
      clearTimeout(timeout)
    }
  }
)

ipcMain.handle(
  'http:fetchJson',
  async (_event, url: string, options?: { timeoutMs?: number }) => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), options?.timeoutMs ?? 20000)
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (IPTV-App)' }
      })
      const text = await res.text()
      try {
        return { ok: res.ok, status: res.status, data: JSON.parse(text) }
      } catch {
        return { ok: false, status: res.status, error: 'Sunucudan geçerli bir yanıt gelmedi' }
      }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    } finally {
      clearTimeout(timeout)
    }
  }
)

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: '#0b0d12',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      // Bazı IPTV sunucuları CORS/karma içerik başlıkları göndermez; oynatıcının
      // canlı yayın segmentlerini alabilmesi için bu kısıtlamayı gevşetiyoruz.
      webSecurity: false,
      allowRunningInsecureContent: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // Video segment isteklerinde de aynı User-Agent'ı kullan (bazı sunucular kontrol eder)
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders['User-Agent'] = 'Mozilla/5.0 (IPTV-App)'
    callback({ requestHeaders: details.requestHeaders })
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (!isMac) app.quit()
})
