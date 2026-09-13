import { app, shell, BrowserWindow, ipcMain, session } from 'electron'
import { join } from 'node:path'
import { writeFile, readFile, mkdir, stat, copyFile, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { once } from 'node:events'
import { spawn, type ChildProcess } from 'node:child_process'
import http from 'node:http'
import os from 'node:os'

const isMac = process.platform === 'darwin'
const USER_AGENT = 'Mozilla/5.0 (IPTV-App)'

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

// ---------------------------------------------------------------------------
// Canlı yayın aktarıcısı + son 45 saniyelik halka arabellek
//
// Oynatıcı .ts canlı yayınları doğrudan sunucudan değil, buradaki yerel
// aktarıcıdan çeker. Aktarıcı yayını olduğu gibi iletirken son 45 saniyeyi
// bellekte tutar; "Son 30 sn'yi kaydet" bu arabellekten dosya üretir. Böylece
// kesit için sunucuya ikinci bir bağlantı açılmaz (bazı hesaplar tek
// bağlantıya sınırlı) ve görüntü kalitesi hiç değişmez (yeniden kodlama yok).
// ---------------------------------------------------------------------------

interface RingChunk {
  t: number
  buf: Buffer
}

const RING_KEEP_MS = 45_000
const RING_MAX_BYTES = 250 * 1024 * 1024
const LIVE_QUEUE_MAX_BYTES = 300 * 1024 * 1024
let ring: RingChunk[] = []
let ringBytes = 0
let ringTarget: string | null = null
let activeUpstream: AbortController | null = null

function pushToRing(buf: Buffer): void {
  const now = Date.now()
  ring.push({ t: now, buf })
  ringBytes += buf.length
  while (ring.length && (ring[0].t < now - RING_KEEP_MS || ringBytes > RING_MAX_BYTES)) {
    ringBytes -= ring[0].buf.length
    ring.shift()
  }
}

let proxyPort = 0
const proxyReady = new Promise<number>((resolve) => {
  const server = http.createServer(async (req, res) => {
    const reqUrl = new URL(req.url || '/', 'http://127.0.0.1')
    const target = reqUrl.searchParams.get('u')
    if (reqUrl.pathname === '/remux' && target) {
      handleRemux(target, res)
      return
    }
    if (reqUrl.pathname !== '/live' || !target) {
      res.writeHead(404)
      res.end()
      return
    }

    // Aynı anda tek canlı yayın: yenisi gelince öncekinin sunucu bağlantısını
    // hemen kapat (tek bağlantılı hesaplarda yeni kanal ancak böyle açılır).
    activeUpstream?.abort()
    const controller = new AbortController()
    activeUpstream = controller
    if (ringTarget !== target) {
      ring = []
      ringBytes = 0
      ringTarget = target
    }
    // Oynatıcı bağlantıyı bırakınca (kanal değişti, pencere kapandı)
    // sunucu bağlantısını da bırak.
    res.on('close', () => controller.abort())

    try {
      const upstream = await fetch(target, {
        signal: controller.signal,
        headers: { 'User-Agent': USER_AGENT }
      })
      if (!upstream.ok || !upstream.body) {
        res.writeHead(upstream.status || 502)
        res.end()
        return
      }
      res.writeHead(200, {
        'Content-Type': upstream.headers.get('content-type') || 'video/mp2t',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*'
      })
      // Sunucudan gelen veriyi HİÇ bekletmeden oku: oynatıcı elinde yeterince
      // veri varken okumayı durduruyor; biz de sunucuyu bekletirsek sunucu
      // bağlantıyı yavaşlatıyor/kesiyor ve ~1 dk sonra görüntü donuyordu.
      // Okunmayan veri burada bellekte sıraya girer (üst sınır aşılırsa
      // bağlantı kapatılır, oynatıcı yeniden bağlanır).
      for await (const chunk of upstream.body as unknown as AsyncIterable<Uint8Array>) {
        const buf = Buffer.from(chunk)
        if (activeUpstream === controller) pushToRing(buf)
        res.write(buf)
        if (res.writableLength > LIVE_QUEUE_MAX_BYTES) {
          controller.abort()
          break
        }
      }
      res.end()
    } catch {
      if (!res.headersSent) res.writeHead(502)
      res.end()
    }
  })
  server.listen(0, '127.0.0.1', () => {
    const address = server.address()
    proxyPort = typeof address === 'object' && address ? address.port : 0
    resolve(proxyPort)
  })
})

ipcMain.handle('proxy:getPort', () => proxyReady)

// ---------------------------------------------------------------------------
// Canlı yayını oynatıcıya parçalı MP4 olarak verme
//
// Sunucu canlı yayını gerçek zamanlı hızda damlatarak gönderir. mpegts.js bu
// damlayan veriyle ilk karede takılıp kalıyordu (aynı dosya bir anda gelince
// sorunsuz akıyordu). Çözüm: ffmpeg yayını yeniden kodlamadan (-c:v copy)
// yarım saniyelik MP4 parçalarına böler, tarayıcının kendi oynatıcısı bunu
// doğrudan oynatır. Görüntü kalitesi değişmez; yalnızca ses AAC'ye çevrilir
// (bazı kanallardaki MP2 sesi tarayıcı MP4 içinde çalamıyor).
//
// ffmpeg girdiyi yukarıdaki /live yolundan okur; böylece sunucuya yine tek
// bağlantı açılır ve kesit arabelleği aynen dolmaya devam eder.
// ---------------------------------------------------------------------------

interface LiveInfo {
  videoCodec?: string
  audioCodec?: string
  fps?: number
  // ffmpeg'in oynatıcıya şimdiye kadar verdiği yayın süresi (saniye)
  outTimeSec?: number
  // Yayının ortalama bit hızı (ffmpeg ölçümü; kanal açılışındaki toplu
  // veri patlamasından etkilenmez)
  bitrateKbps?: number
}

let liveInfo: LiveInfo = {}
let activeRemux: ChildProcess | null = null

function parseStreamInfo(line: string): void {
  const video = line.match(/Stream #0:\d+.*?: Video: (\w+)/)
  if (video && !liveInfo.videoCodec) {
    liveInfo.videoCodec = video[1]
    const fps = line.match(/([\d.]+) fps/)
    if (fps) liveInfo.fps = parseFloat(fps[1])
  }
  const audio = line.match(/Stream #0:\d+.*?: Audio: (\w+)/)
  if (audio && !liveInfo.audioCodec) liveInfo.audioCodec = audio[1]
}

function handleRemux(target: string, res: http.ServerResponse): void {
  const bin = ffmpegPath()
  if (!bin || !proxyPort) {
    res.writeHead(503)
    res.end()
    return
  }
  activeRemux?.kill('SIGKILL')
  liveInfo = {}
  const input = `http://127.0.0.1:${proxyPort}/live?u=${encodeURIComponent(target)}`
  const proc = spawn(
    bin,
    [
      '-hide_banner',
      '-nostats',
      // Yarım saniyede bir "şu ana kadar kaç saniyelik yayın çıktı" bilgisi;
      // oynatıcı elindeki gerçek yedeği bununla hesaplıyor.
      '-stats_period',
      '0.5',
      '-progress',
      'pipe:2',
      '-loglevel',
      'info',
      '-fflags',
      '+genpts+nobuffer+discardcorrupt',
      '-probesize',
      '1000000',
      '-analyzeduration',
      '1500000',
      // 15 sn hiç veri gelmezse çık → oynatıcı hata görür, otomatik yeniden dener
      '-rw_timeout',
      '15000000',
      '-i',
      input,
      '-map',
      '0:v:0',
      '-map',
      '0:a:0?',
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-f',
      'mp4',
      '-movflags',
      'frag_keyframe+empty_moov+default_base_moof',
      '-frag_duration',
      '500000',
      '-flush_packets',
      '1',
      'pipe:1'
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  )
  activeRemux = proc

  let mappingDone = false
  let stderrTail = ''
  proc.stderr.on('data', (d: Buffer) => {
    if (activeRemux !== proc) return
    stderrTail += d.toString()
    const lines = stderrTail.split('\n')
    stderrTail = lines.pop() || ''
    for (const line of lines) {
      if (line.startsWith('out_time_us=')) {
        const us = Number(line.slice('out_time_us='.length))
        if (Number.isFinite(us) && us > 0) liveInfo.outTimeSec = us / 1e6
      } else if (line.startsWith('bitrate=')) {
        const kbps = parseFloat(line.slice('bitrate='.length))
        if (Number.isFinite(kbps) && kbps > 0) liveInfo.bitrateKbps = Math.round(kbps)
      } else if (!mappingDone) {
        if (line.includes('Stream mapping')) mappingDone = true
        else parseStreamInfo(line)
      }
    }
  })

  // Başlığı ilk veri gelince gönder: ffmpeg yayını açamazsa oynatıcı 502 alır
  // ve hemen yedek yönteme geçer.
  proc.stdout.on('data', (chunk: Buffer) => {
    if (!res.headersSent) {
      res.writeHead(200, { 'Content-Type': 'video/mp4', 'Cache-Control': 'no-cache' })
    }
    if (!res.write(chunk)) {
      proc.stdout.pause()
      res.once('drain', () => proc.stdout.resume())
    }
  })
  proc.on('error', () => {
    if (!res.headersSent) res.writeHead(502)
    res.end()
  })
  proc.on('close', () => {
    if (activeRemux === proc) activeRemux = null
    if (!res.headersSent) res.writeHead(502)
    res.end()
  })
  res.on('close', () => proc.kill('SIGKILL'))
}

ipcMain.handle('proxy:canRemux', () => ffmpegPath() !== null)

ipcMain.handle('proxy:liveInfo', () => {
  // Son 5 saniyede sunucudan gelen veri miktarından gerçek bit hızı
  const since = Date.now() - 5000
  let bytes = 0
  for (let i = ring.length - 1; i >= 0 && ring[i].t >= since; i--) bytes += ring[i].buf.length
  return {
    ...liveInfo,
    bitrateKbps: liveInfo.bitrateKbps ?? (bytes ? Math.round((bytes * 8) / 5 / 1000) : undefined)
  }
})

// ---------- Kesit kaydetme ----------

function ffmpegPath(): string | null {
  const exe = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
  const candidates = app.isPackaged
    ? [join(process.resourcesPath, 'ffmpeg', exe)]
    : [join(app.getAppPath(), 'resources', 'ffmpeg', `${process.platform}-${process.arch}`, exe)]
  return candidates.find((p) => existsSync(p)) || null
}

function runFfmpeg(args: string[], timeoutMs = 90_000): Promise<boolean> {
  const bin = ffmpegPath()
  if (!bin) return Promise.resolve(false)
  return new Promise((resolve) => {
    const proc = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    const timer = setTimeout(() => proc.kill('SIGKILL'), timeoutMs)
    proc.on('error', () => {
      clearTimeout(timer)
      resolve(false)
    })
    proc.on('close', (code) => {
      clearTimeout(timer)
      resolve(code === 0)
    })
  })
}

// MPEG-TS paketleri 188 bayt ve 0x47 ile başlar; kesiti bir paket sınırından
// başlatmak için ardışık üç senkron baytını arıyoruz.
function findTsSync(buf: Buffer): number {
  for (let i = 0; i + 376 < buf.length && i < 188 * 50; i++) {
    if (buf[i] === 0x47 && buf[i + 188] === 0x47 && buf[i + 376] === 0x47) return i
  }
  return 0
}

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
    const fromEnd = Math.ceil(seconds + Math.max(0, Math.min(latencySec, 30)))
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
