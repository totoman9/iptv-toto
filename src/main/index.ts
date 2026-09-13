import { app, shell, BrowserWindow, ipcMain, session, screen, type Rectangle } from 'electron'
import { join } from 'node:path'
import { writeFile, readFile, mkdir, stat, copyFile, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import os from 'node:os'
import { USER_AGENT } from './constants'
import { runFfmpeg } from './ffmpeg'
import { findTsSync, getRing, initLive } from './live'

initLive()

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

// İçerik önbelleği (kanal/film/dizi listeleri). Her açılışta sunucudan
// baştan yüklemek yerine önce buradan anında gösteriyoruz. Büyük olduğu için
// girintisiz yazılıyor.
function cachePath(key: string): string {
  return join(app.getPath('userData'), 'cache', `${key.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`)
}

ipcMain.handle('cache:read', async (_event, key: string) => {
  try {
    return JSON.parse(await readFile(cachePath(key), 'utf-8'))
  } catch {
    return null
  }
})

ipcMain.handle('cache:write', async (_event, key: string, value: unknown) => {
  await mkdir(join(app.getPath('userData'), 'cache'), { recursive: true })
  await writeFile(cachePath(key), JSON.stringify(value), 'utf-8')
  return true
})

// Renderer'dan CORS kısıtlaması olmadan HTTP istekleri (M3U indirme, Xtream API).
// Zaman aşımı gövdenin tamamını kapsamalı: sadece başlıkları kapsarsa, gövde
// yarıda takıldığında istek sonsuza kadar asılı kalıyor (film listesi böyle
// "yükleniyor"da kalmıştı).
async function fetchTextWithTimeout(
  url: string,
  timeoutMs: number
): Promise<{ ok: boolean; status: number; text: string }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': USER_AGENT } })
    const text = await res.text()
    return { ok: res.ok, status: res.status, text }
  } finally {
    clearTimeout(timeout)
  }
}

ipcMain.handle(
  'http:fetchText',
  async (_event, url: string, options?: { timeoutMs?: number }) => {
    try {
      const res = await fetchTextWithTimeout(url, options?.timeoutMs ?? 20000)
      return { ok: res.ok, status: res.status, data: res.text }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }
)

ipcMain.handle(
  'http:fetchJson',
  async (_event, url: string, options?: { timeoutMs?: number }) => {
    try {
      const res = await fetchTextWithTimeout(url, options?.timeoutMs ?? 20000)
      const text = res.text
      try {
        return { ok: res.ok, status: res.status, data: JSON.parse(text) }
      } catch {
        return { ok: false, status: res.status, error: 'Sunucudan geçerli bir yanıt gelmedi' }
      }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }
)


// ---------- Kesit kaydetme ----------

function clipFileBase(title: string): string {
  const d = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}`
  const safeTitle = title.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)
  return `${safeTitle || 'Kesit'} ${stamp}`
}

async function clipsDir(): Promise<string> {
  const dir = join(app.getPath('videos'), 'IPTV Toto Kesitler')
  await mkdir(dir, { recursive: true })
  return dir
}

async function finalizeToMp4(
  inputPath: string,
  outPath: string,
  inputArgs: string[] = [],
  outputArgs: string[] = []
): Promise<boolean> {
  const common = ['-y', '-hide_banner', '-loglevel', 'error', ...inputArgs]
  // Önce kayıpsız (yeniden kodlamadan) dene; olmazsa sadece sesi AAC'ye çevir.
  if (
    await runFfmpeg([
      ...common,
      '-i',
      inputPath,
      ...outputArgs,
      '-c',
      'copy',
      '-movflags',
      '+faststart',
      outPath
    ])
  )
    return true
  return runFfmpeg([
    ...common,
    '-i',
    inputPath,
    ...outputArgs,
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-b:a',
    '160k',
    '-movflags',
    '+faststart',
    outPath
  ])
}

ipcMain.handle('clip:saveLive', async (_event, title: string, seconds = 30, latencySec = 0) => {
  // Arabellekteki her şeyi al: sunucu bağlanınca birkaç saniyelik geçmişi
  // topluca gönderdiği için "son 30 sn içinde gelen veri" 30 sn'den uzun
  // görüntü içerebiliyor. Kesin süreyi aşağıda ffmpeg ile içeriğe göre
  // (dosya sonundan geriye) kırpıyoruz.
  const ring = getRing()
  if (ring.length === 0) {
    return { ok: false, error: 'Kaydedilecek görüntü yok — yayın birkaç saniye oynasın, sonra tekrar dene.' }
  }
  let data = Buffer.concat(ring.map((p) => p.buf))
  data = data.subarray(findTsSync(data))

  const base = clipFileBase(title)
  const dir = await clipsDir()
  const tmpTs = join(os.tmpdir(), `iptv-toto-${Date.now()}.ts`)
  await writeFile(tmpTs, data)
  try {
    const mp4 = join(dir, `${base}.mp4`)
    // Oynatıcı canlının latencySec kadar gerisinde; ekranda görülen anın son
    // `seconds` saniyesini al.
    // (geri sarılmışsa bu gecikme 2,5 dakikaya kadar çıkabilir)
    const fromEnd = Math.ceil(seconds + Math.max(0, Math.min(latencySec, 140)))
    if (
      await finalizeToMp4(
        tmpTs,
        mp4,
        ['-fflags', '+genpts', '-sseof', `-${fromEnd}`],
        ['-t', String(seconds)]
      )
    ) {
      return { ok: true, path: mp4 }
    }
    if (await finalizeToMp4(tmpTs, mp4, ['-fflags', '+genpts'])) {
      return { ok: true, path: mp4 }
    }
    // Dönüştürülemediyse ham .ts olarak bırak (VLC gibi oynatıcılar açar)
    const tsOut = join(dir, `${base}.ts`)
    await copyFile(tmpTs, tsOut)
    return { ok: true, path: tsOut }
  } finally {
    unlink(tmpTs).catch(() => {})
  }
})

// HLS canlı yayın kesiti: oynatıcı son parçaların baytlarını gönderiyor
ipcMain.handle('clip:saveBuffer', async (_event, bytes: Uint8Array, title: string) => {
  if (!bytes || bytes.length === 0) return { ok: false, error: 'Kaydedilecek görüntü yok' }
  const data = Buffer.from(bytes)
  const base = clipFileBase(title)
  const dir = await clipsDir()
  const tmpTs = join(os.tmpdir(), `iptv-toto-${Date.now()}.ts`)
  await writeFile(tmpTs, data.subarray(findTsSync(data)))
  try {
    const mp4 = join(dir, `${base}.mp4`)
    if (await finalizeToMp4(tmpTs, mp4, ['-fflags', '+genpts'])) return { ok: true, path: mp4 }
    const tsOut = join(dir, `${base}.ts`)
    await copyFile(tmpTs, tsOut)
    return { ok: true, path: tsOut }
  } finally {
    unlink(tmpTs).catch(() => {})
  }
})

// Film/dizi (VOD) kesiti: dosya zaten sunucuda duruyor; ffmpeg ile istenen
// 30 saniyelik aralığı yeniden kodlamadan kopyalıyoruz.
ipcMain.handle(
  'clip:saveVod',
  async (_event, url: string, title: string, endSeconds: number, seconds = 30) => {
    const start = Math.max(0, endSeconds - seconds)
    const dir = await clipsDir()
    const out = join(dir, `${clipFileBase(title)}.mp4`)
    const ok = await runFfmpeg([
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-user_agent',
      USER_AGENT,
      '-ss',
      String(start),
      '-i',
      url,
      '-t',
      String(Math.min(seconds, endSeconds)),
      '-c',
      'copy',
      '-movflags',
      '+faststart',
      out
    ])
    if (ok && existsSync(out) && (await stat(out)).size > 0) return { ok: true, path: out }
    return {
      ok: false,
      error:
        'Kesit alınamadı. Hesabın aynı anda tek bağlantıya izin veriyorsa film oynarken kesit alınamayabilir.'
    }
  }
)

ipcMain.handle('shell:showItem', (_event, filePath: string) => {
  shell.showItemInFolder(filePath)
})

// ---------- Mini pencere (her zaman üstte) ----------
// Uygulama penceresi küçülüp ekranın köşesine yerleşir ve diğer pencerelerin
// üstünde kalır; yalnızca oynatıcı görünür (arayüz tarafı body sınıfıyla).
let boundsBeforeCompact: Rectangle | null = null

ipcMain.handle('window:setCompact', (event, on: boolean) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return false
  if (on) {
    if (!boundsBeforeCompact) boundsBeforeCompact = win.getBounds()
    const area = screen.getDisplayMatching(win.getBounds()).workArea
    const width = 520
    const height = 293
    win.setMinimumSize(320, 180)
    win.setBounds(
      { x: area.x + area.width - width - 24, y: area.y + area.height - height - 24, width, height },
      true
    )
    win.setAlwaysOnTop(true, 'floating')
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  } else {
    win.setAlwaysOnTop(false)
    win.setVisibleOnAllWorkspaces(false)
    win.setMinimumSize(1024, 640)
    if (boundsBeforeCompact) win.setBounds(boundsBeforeCompact, true)
    boundsBeforeCompact = null
  }
  return true
})

// ---------- Ekran görüntüsü ----------

async function screenshotsDir(): Promise<string> {
  const dir = join(app.getPath('pictures'), 'IPTV Toto Ekran Görüntüleri')
  await mkdir(dir, { recursive: true })
  return dir
}

ipcMain.handle('media:saveScreenshot', async (_event, bytes: Uint8Array, title: string) => {
  try {
    const out = join(await screenshotsDir(), `${clipFileBase(title)}.png`)
    await writeFile(out, Buffer.from(bytes))
    return { ok: true, path: out }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Kaydedilemedi' }
  }
})

// Video karesi okunamazsa (güvenlik kısıtı) ekranda görünen alanı yakala
ipcMain.handle('media:capturePage', async (event, rect: Rectangle, title: string) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return { ok: false, error: 'Pencere bulunamadı' }
  try {
    const img = await win.webContents.capturePage({
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    })
    const out = join(await screenshotsDir(), `${clipFileBase(title)}.png`)
    await writeFile(out, img.toPNG())
    return { ok: true, path: out }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Kaydedilemedi' }
  }
})

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    backgroundColor: '#faf8fd',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      // Bazı IPTV sunucuları CORS/karma içerik başlıkları göndermez; oynatıcının
      // canlı yayın segmentlerini alabilmesi için bu kısıtlamayı gevşetiyoruz.
      webSecurity: false,
      allowRunningInsecureContent: true,
      // Pencere başka bir pencerenin arkasında kalınca Chromium sayfayı
      // "görünmez" sayıp video çözmeyi askıya alıyordu; görüntü ilk karede
      // donup kalıyor, ara ara birkaç kare ilerliyordu ("fotoğraf gibi").
      // Oynatıcı uygulamasında bunu istemiyoruz.
      backgroundThrottling: false
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
    details.requestHeaders['User-Agent'] = USER_AGENT
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
