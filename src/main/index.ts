import { app, shell, BrowserWindow, ipcMain, session, screen, Menu, type Rectangle } from 'electron'
import { join } from 'node:path'
import { writeFile, readFile, mkdir, stat, copyFile, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import os from 'node:os'
import { USER_AGENT } from './constants'
import { clipFileBase, finalizeToMp4, runFfmpeg } from './ffmpeg'
import { initRecorder } from './recorder'
import { initSubtitles } from './subtitles'
import { findTsSync, getRing, initLive } from './live'
import { decodeSecret, encodeSecret } from './crypto'
import { initLog, installCrashLogging } from './log'
import { initUpdater } from './updater'

initLive()

const isMac = process.platform === 'darwin'

function getUserDataPath(fileName: string): string {
  return join(app.getPath('userData'), fileName)
}

async function ensureUserDataDir(): Promise<void> {
  await mkdir(app.getPath('userData'), { recursive: true })
}

// IPTV kaynaklarındaki şifreyi diske yazmadan önce şifreler, okurken çözer.
// Kaynak listesinin geri kalanı (ad, adres, kullanıcı adı) düz kalır — yalnızca
// şifre hassas. Eski (şifrelenmemiş) kayıtlar da okunabilir; bir sonraki
// kayıtta otomatik şifrelenmiş hale geçerler.
interface StoredXtreamSource {
  type: string
  password?: string
  [key: string]: unknown
}

function encodeSourcesForDisk(value: unknown): unknown {
  if (!Array.isArray(value)) return value
  return value.map((s: StoredXtreamSource) =>
    s?.type === 'xtream' && typeof s.password === 'string' && s.password
      ? { ...s, password: encodeSecret(s.password) }
      : s
  )
}

function decodeSourcesFromDisk(value: unknown): unknown {
  if (!Array.isArray(value)) return value
  return value.map((s: StoredXtreamSource) =>
    s?.type === 'xtream' && typeof s.password === 'string' && s.password
      ? { ...s, password: decodeSecret(s.password) ?? '' }
      : s
  )
}

// Basit JSON tabanlı depolama (kaynaklar, favoriler, ayarlar)
ipcMain.handle('store:read', async (_event, key: string) => {
  try {
    const raw = await readFile(getUserDataPath(`${key}.json`), 'utf-8')
    const value = JSON.parse(raw)
    return key === 'sources' ? decodeSourcesFromDisk(value) : value
  } catch {
    return null
  }
})

ipcMain.handle('store:write', async (_event, key: string, value: unknown) => {
  await ensureUserDataDir()
  const toWrite = key === 'sources' ? encodeSourcesForDisk(value) : value
  await writeFile(getUserDataPath(`${key}.json`), JSON.stringify(toWrite, null, 2), 'utf-8')
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

async function clipsDir(): Promise<string> {
  const dir = join(app.getPath('videos'), 'IPTV Toto Kesitler')
  await mkdir(dir, { recursive: true })
  return dir
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
// Kullanıcı bu pencereyi sürükleyip taşıyabilir ve kenarından
// büyütüp/küçültebilir; en son bıraktığı yer ve boyut hatırlanır (bir
// dahaki mini pencereye geçişte, hatta uygulama kapatılıp açılsa bile).
let boundsBeforeCompact: Rectangle | null = null
let isCompactNow = false
let compactBounds: Rectangle | null = null
let compactSaveTimer: ReturnType<typeof setTimeout> | null = null

const COMPACT_DEFAULT = { width: 520, height: 293 }
const COMPACT_MIN = { width: 320, height: 180 }

function compactWindowFile(): string {
  return getUserDataPath('compact-window.json')
}

async function loadCompactBounds(): Promise<void> {
  try {
    const raw = JSON.parse(await readFile(compactWindowFile(), 'utf-8'))
    if (
      typeof raw?.x === 'number' &&
      typeof raw?.y === 'number' &&
      typeof raw?.width === 'number' &&
      typeof raw?.height === 'number'
    ) {
      compactBounds = raw
    }
  } catch {
    /* henüz kaydedilmemiş — varsayılan konum kullanılacak */
  }
}
void loadCompactBounds()

function saveCompactBoundsSoon(bounds: Rectangle): void {
  compactBounds = bounds
  if (compactSaveTimer) clearTimeout(compactSaveTimer)
  compactSaveTimer = setTimeout(() => {
    void writeFile(compactWindowFile(), JSON.stringify(bounds), 'utf-8').catch(() => {})
  }, 600)
}

// Kayıtlı konum artık ekranda yoksa (harici ekran çıkarılmış olabilir) en
// yakın ekranın çalışma alanına geri çeker.
function clampToVisibleArea(bounds: Rectangle): Rectangle {
  const area = screen.getDisplayMatching(bounds).workArea
  const width = Math.min(bounds.width, area.width)
  const height = Math.min(bounds.height, area.height)
  const x = Math.min(Math.max(bounds.x, area.x), area.x + area.width - width)
  const y = Math.min(Math.max(bounds.y, area.y), area.y + area.height - height)
  return { x, y, width, height }
}

ipcMain.handle('window:setCompact', (event, on: boolean) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return false
  if (on) {
    if (!boundsBeforeCompact) boundsBeforeCompact = win.getBounds()
    win.setMinimumSize(COMPACT_MIN.width, COMPACT_MIN.height)
    if (compactBounds) {
      win.setBounds(clampToVisibleArea(compactBounds), true)
    } else {
      const area = screen.getDisplayMatching(win.getBounds()).workArea
      const { width, height } = COMPACT_DEFAULT
      win.setBounds(
        { x: area.x + area.width - width - 24, y: area.y + area.height - height - 24, width, height },
        true
      )
    }
    win.setAlwaysOnTop(true, 'floating')
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    isCompactNow = true
  } else {
    isCompactNow = false
    win.setAlwaysOnTop(false)
    win.setVisibleOnAllWorkspaces(false)
    win.setMinimumSize(1024, 640)
    if (boundsBeforeCompact) win.setBounds(boundsBeforeCompact, true)
    boundsBeforeCompact = null
  }
  return true
})

// Fragman: YouTube videosunu ayrı bir pencerede aç (kimlik yoksa tarayıcıda ara)
ipcMain.handle('media:openTrailer', async (_event, arg: { id?: string; query?: string }) => {
  if (arg.id && /^[\w-]{11}$/.test(arg.id)) {
    const win = new BrowserWindow({
      width: 1100,
      height: 650,
      backgroundColor: '#000000',
      title: 'Fragman',
      autoHideMenuBar: true
    })
    await win.loadURL(`https://www.youtube.com/watch?v=${arg.id}`)
    return true
  }
  if (arg.query) {
    await shell.openExternal(`https://www.youtube.com/results?search_query=${encodeURIComponent(arg.query)}`)
  }
  return true
})

// Hatırlatma bildirimine tıklanınca uygulamayı öne getir
ipcMain.on('window:focus', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
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
    // Mac'te sistemin kırmızı/sarı/yeşil düğmeleri (hiddenInset) kalsın.
    // Windows/Linux'ta ise Electron'un varsayılan pencere çerçevesi hem çirkin
    // bir başlık çubuğu hem de altında "File Edit View..." menü şeridi
    // getiriyordu; ikisini de kaldırıp kendi üst çubuğumuzdaki düğmelerle
    // (küçült/büyüt/kapat) değiştiriyoruz.
    titleBarStyle: isMac ? 'hiddenInset' : undefined,
    frame: isMac,
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

  // Windows/Linux'taki özel küçült/büyüt/kapat düğmeleri bu pencereyi kontrol eder
  mainWindow.on('maximize', () => mainWindow.webContents.send('window:maximized', true))
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window:maximized', false))

  // Mini pencerede kullanıcı sürükleyip taşıdığında ya da kenarından
  // büyütüp/küçülttüğünde, bir dahaki sefere aynı yerde/boyutta açılsın
  const onCompactBoundsChange = (): void => {
    if (isCompactNow) saveCompactBoundsSoon(mainWindow.getBounds())
  }
  mainWindow.on('move', onCompactBoundsChange)
  mainWindow.on('resize', onCompactBoundsChange)

  installCrashLogging(() => mainWindow)
  initUpdater(() => mainWindow)

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

// Windows/Linux'ta kendi üst çubuğumuz olduğu için Electron'un varsayılan
// "File Edit View Window Help" menü şeridine gerek yok. Mac'te dokunmuyoruz:
// oradaki menü ekranın üstündeki sistem çubuğuna gidiyor, pencerenin içinde
// görünmüyor ve Cmd+Q gibi kısayolları da o sağlıyor.
if (!isMac) Menu.setApplicationMenu(null)

ipcMain.on('window:minimize', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize()
})
ipcMain.on('window:toggleMaximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return
  if (win.isMaximized()) win.unmaximize()
  else win.maximize()
})
ipcMain.on('window:close', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close()
})
ipcMain.handle('window:isMaximized', (event) => BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false)

app.whenReady().then(() => {
  // Video segment isteklerinde de aynı User-Agent'ı kullan (bazı sunucular kontrol eder)
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    // YouTube (fragman penceresi) kendi tarayıcı kimliğiyle çalışsın
    if (!/(youtube\.com|youtu\.be|ytimg\.com|googlevideo\.com|google\.com|gstatic\.com|ggpht\.com)/.test(details.url)) {
      details.requestHeaders['User-Agent'] = USER_AGENT
    }
    callback({ requestHeaders: details.requestHeaders })
  })

  initLog()
  initRecorder()
  initSubtitles()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (!isMac) app.quit()
})
