import { ipcMain } from 'electron'
import http from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'
import { ffmpegPath } from './ffmpeg'
import { USER_AGENT } from './constants'

// ---------------------------------------------------------------------------
// Canlı yayın oturumu + son 2,5 dakikalık halka arabellek
//
// Sunucuya aynı anda TEK bağlantı açılır (bazı hesaplar tek bağlantıya
// sınırlı). Bu bağlantıdan gelen veri birden fazla "aboneye" dağıtılır:
// oynatıcı, geri sarma (arabellekten tekrar oynatma) ve kayıt aynı
// bağlantıyı paylaşır. Son 2,5 dakika bellekte tutulur: "Son 30 sn'yi
// kaydet" ve canlı yayını geri sarma bu arabellekten çalışır.
//
// Oynatıcı kısa süreliğine bağlantıyı bırakırsa (geri sarma, yeniden
// bağlanma) sunucu bağlantısı birkaç saniye açık tutulur; kanal
// değiştirilince eskisi hemen kapatılır.
// ---------------------------------------------------------------------------

export interface RingChunk {
  t: number // sunucudan geliş zamanı (ms)
  m: number // yayının kendi zaman çizelgesindeki konumu (sn, PCR'dan)
  buf: Buffer
}

const RING_KEEP_MS = 150_000
const RING_MAX_BYTES = 350 * 1024 * 1024
// Okunmayan veri bu kadarı aşarsa o abone kesilir (oynatıcı yeniden bağlanır)
const SUBSCRIBER_QUEUE_MAX = 300 * 1024 * 1024
const IDLE_CLOSE_MS = 2500

let ring: RingChunk[] = []
let ringBytes = 0

// Yayının kendi saati (PCR). Sunucu bağlanınca birkaç saniyelik/dakikalık
// geçmişi topluca gönderdiği için "verinin geliş zamanı" yayının zaman
// çizelgesini göstermiyor; geri sarma ve "canlının kaç sn gerisindeyiz"
// hesabı bu yüzden yayının kendi zaman damgasıyla yapılır.
let pcrLast = -1
let pcrOffset = 0
let hasPcr = false
let mediaEdge = 0 // gelen en son verinin yayın zamanı (sn)

function resetMediaClock(): void {
  pcrLast = -1
  pcrOffset = 0
  hasPcr = false
  mediaEdge = 0
}

// Parçadaki son PCR değeri (sn). Parça sınırında bölünen paketler atlanır;
// yalnızca zaman okumak için, veri olduğu gibi iletilir.
function readPcr(buf: Buffer): number | null {
  let found: number | null = null
  for (let i = findTsSync(buf); i + 11 < buf.length; i += 188) {
    if (buf[i] !== 0x47) break
    const hasAdaptation = ((buf[i + 3] >> 4) & 2) !== 0
    if (hasAdaptation && buf[i + 4] >= 7 && (buf[i + 5] & 0x10) !== 0) {
      found =
        buf[i + 6] * 33554432 +
        buf[i + 7] * 131072 +
        buf[i + 8] * 512 +
        buf[i + 9] * 2 +
        (buf[i + 10] >> 7)
    }
  }
  return found === null ? null : found / 90000
}

function mediaTimeOf(buf: Buffer, arrivedAt: number): number {
  const pcr = readPcr(buf)
  if (pcr !== null) {
    // Saat başa sardıysa ya da kanal saatini sıfırladıysa kesintisiz devam et
    if (pcrLast >= 0 && (pcr < pcrLast - 5 || pcr > pcrLast + 60)) pcrOffset += pcrLast - pcr
    pcrLast = pcr
    hasPcr = true
    mediaEdge = pcr + pcrOffset
  } else if (!hasPcr) {
    mediaEdge = arrivedAt / 1000
  }
  return mediaEdge
}

function pushToRing(buf: Buffer): void {
  const now = Date.now()
  ring.push({ t: now, m: mediaTimeOf(buf, now), buf })
  ringBytes += buf.length
  while (ring.length && (ring[0].t < now - RING_KEEP_MS || ringBytes > RING_MAX_BYTES)) {
    ringBytes -= ring[0].buf.length
    ring.shift()
  }
}

export function getRing(): RingChunk[] {
  return ring
}

// MPEG-TS paketleri 188 bayt ve 0x47 ile başlar; veriyi bir paket sınırından
// başlatmak için ardışık üç senkron baytını arıyoruz.
export function findTsSync(buf: Buffer): number {
  for (let i = 0; i + 376 < buf.length && i < 188 * 50; i++) {
    if (buf[i] === 0x47 && buf[i + 188] === 0x47 && buf[i + 376] === 0x47) return i
  }
  return 0
}

export interface Subscriber {
  write: (buf: Buffer) => void
  end: () => void
  // 'recorder': kayıt sürerken oynatıcı başka içeriğe geçse de bağlantı kapanmaz
  kind?: 'player' | 'recorder'
}

interface ReadyState {
  ok: boolean
  status: number
  contentType?: string
}

export interface LiveSession {
  target: string
  controller: AbortController
  subscribers: Set<Subscriber>
  ready: Promise<ReadyState>
  idleTimer: ReturnType<typeof setTimeout> | null
  ended: boolean
}

let session: LiveSession | null = null
const sessionListeners = new Set<(target: string | null) => void>()

export function onSessionChange(fn: (target: string | null) => void): void {
  sessionListeners.add(fn)
}

function notifySession(): void {
  const target = activeTarget()
  for (const fn of sessionListeners) fn(target)
}

function closeSession(s: LiveSession): void {
  if (s.idleTimer) clearTimeout(s.idleTimer)
  s.controller.abort()
  s.ended = true
  if (session === s) {
    session = null
    notifySession()
  }
}

function scheduleIdleClose(s: LiveSession): void {
  if (s.ended || s.subscribers.size > 0) return
  if (s.idleTimer) clearTimeout(s.idleTimer)
  s.idleTimer = setTimeout(() => {
    if (s.subscribers.size === 0) closeSession(s)
  }, IDLE_CLOSE_MS)
}

async function pump(s: LiveSession, body: ReadableStream<Uint8Array>): Promise<void> {
  try {
    for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
      const buf = Buffer.from(chunk)
      if (session === s) pushToRing(buf)
      for (const sub of s.subscribers) sub.write(buf)
    }
  } catch {
    /* bağlantı kapandı */
  }
  s.ended = true
  if (session === s) {
    session = null
    notifySession()
  }
  for (const sub of s.subscribers) sub.end()
  s.subscribers.clear()
}

function hasRecorder(s: LiveSession): boolean {
  for (const sub of s.subscribers) if (sub.kind === 'recorder') return true
  return false
}

// Kayıt sürüyorsa kaydedilen kanalın adresi
export function recorderTarget(): string | null {
  return session && !session.ended && hasRecorder(session) ? session.target : null
}

// Bu adres için açık bir oturum varsa onu kullanır; yoksa (öncekini kapatıp)
// sunucuya yeni bağlantı açar. Başka bir kanal kaydediliyorsa null döner:
// tek bağlantılı hesapta kaydı kesmemek için yeni kanal açılmaz.
export function ensureSession(target: string): LiveSession | null {
  if (session && session.target === target && !session.ended) {
    if (session.idleTimer) {
      clearTimeout(session.idleTimer)
      session.idleTimer = null
    }
    return session
  }
  if (session && !session.ended && hasRecorder(session)) return null
  if (session) closeSession(session)
  ring = []
  ringBytes = 0
  resetMediaClock()

  const controller = new AbortController()
  const s: LiveSession = {
    target,
    controller,
    subscribers: new Set(),
    ready: Promise.resolve({ ok: false, status: 502 }),
    idleTimer: null,
    ended: false
  }
  s.ready = (async (): Promise<ReadyState> => {
    try {
      const upstream = await fetch(target, {
        signal: controller.signal,
        headers: { 'User-Agent': USER_AGENT }
      })
      if (!upstream.ok || !upstream.body) {
        closeSession(s)
        return { ok: false, status: upstream.status || 502 }
      }
      void pump(s, upstream.body)
      return {
        ok: true,
        status: 200,
        contentType: upstream.headers.get('content-type') || 'video/mp2t'
      }
    } catch {
      closeSession(s)
      return { ok: false, status: 502 }
    }
  })()
  session = s
  notifySession()
  return s
}

export function subscribe(s: LiveSession, sub: Subscriber): () => void {
  s.subscribers.add(sub)
  if (s.idleTimer) {
    clearTimeout(s.idleTimer)
    s.idleTimer = null
  }
  return () => {
    s.subscribers.delete(sub)
    scheduleIdleClose(s)
  }
}

export function activeTarget(): string | null {
  return session && !session.ended ? session.target : null
}

// Oynatıcı canlı yayından film/diziye geçince (veya durunca) sunucu
// bağlantısını hemen bırak: tek bağlantılı hesaplarda film ancak böyle
// açılabiliyor. Kayıt sürüyorsa bağlantıya dokunulmaz.
export function releaseLive(): void {
  if (!session || hasRecorder(session)) return
  closeSession(session)
}

// ---------- Yerel dosya sunma (kayıtları oynatmak için, ileri/geri sarılabilir) ----------

const fileRoots = new Set<string>()

export function allowFileRoot(dir: string): void {
  fileRoots.add(resolve(dir))
}

const MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.ts': 'video/mp2t',
  '.mkv': 'video/x-matroska'
}

async function serveFile(
  p: string | null,
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  const full = p ? resolve(p) : ''
  if (!full || ![...fileRoots].some((root) => full.startsWith(root + sep))) {
    res.writeHead(403)
    res.end()
    return
  }
  let size: number
  try {
    size = (await stat(full)).size
  } catch {
    res.writeHead(404)
    res.end()
    return
  }
  const type = MIME[extname(full).toLowerCase()] || 'application/octet-stream'
  const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/)
  if (range) {
    const start = range[1] ? Number(range[1]) : 0
    const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1
    if (start >= size) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` })
      res.end()
      return
    }
    res.writeHead(206, {
      'Content-Type': type,
      'Content-Length': end - start + 1,
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Accept-Ranges': 'bytes'
    })
    createReadStream(full, { start, end }).pipe(res)
  } else {
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes' })
    createReadStream(full).pipe(res)
  }
}

// /live?u=<adres>&back=<sn>: yayını ham .ts olarak verir. back > 0 ise önce
// arabellekteki son `back` saniyeyi, sonra canlı veriyi gönderir.
// Oynatıcının (ffmpeg'in) şu an okuduğu veri, gelen en son verinin kaç
// saniye (yayın zamanı) gerisinde. Okunmayı bekleyen veri kuyrukta durduğu
// için "canlının ne kadar gerisindeyiz" hesabında bu da sayılmalı.
let playerQueued: (() => number) | null = null

async function handleLive(target: string, back: number, res: http.ServerResponse): Promise<void> {
  const found = ensureSession(target)
  if (!found) {
    // Başka bir kanal kaydediliyor (423 = kilitli)
    res.writeHead(423)
    res.end()
    return
  }
  const s = found
  let unsubscribe: (() => void) | null = null
  let closed = false

  let written = 0
  const marks: { end: number; m: number }[] = []
  const send = (buf: Buffer, mediaTime: number): void => {
    written += buf.length
    marks.push({ end: written, m: mediaTime })
    res.write(buf)
  }
  const queued = (): number => {
    const consumed = written - res.writableLength
    while (marks.length > 1 && marks[0].end <= consumed) marks.shift()
    return marks.length ? Math.max(0, mediaEdge - marks[0].m) : 0
  }
  playerQueued = queued

  res.on('close', () => {
    closed = true
    if (playerQueued === queued) playerQueued = null
    if (unsubscribe) unsubscribe()
    else scheduleIdleClose(s)
  })

  const ready = await s.ready
  if (closed) return
  if (!ready.ok) {
    res.writeHead(ready.status)
    res.end()
    return
  }
  res.writeHead(200, {
    'Content-Type': ready.contentType || 'video/mp2t',
    'Cache-Control': 'no-cache',
    'Access-Control-Allow-Origin': '*'
  })

  if (back > 0 && ring.length > 0) {
    const from = mediaEdge - back
    const recent = ring.filter((c) => c.m >= from)
    const list = recent.length > 0 ? recent : ring
    list.forEach((c, i) => send(i === 0 ? c.buf.subarray(findTsSync(c.buf)) : c.buf, c.m))
  }

  // Sunucudan gelen veriyi HİÇ bekletmeden dağıtıyoruz: oynatıcı elinde
  // yeterince veri varken okumayı durduruyor; sunucuyu bekletirsek bağlantıyı
  // yavaşlatıp ~1 dk sonra görüntüyü donduruyordu. Okunmayan veri burada
  // bellekte sıraya girer.
  unsubscribe = subscribe(s, {
    kind: 'player',
    write: (buf) => {
      send(buf, mediaEdge)
      if (res.writableLength > SUBSCRIBER_QUEUE_MAX) res.destroy()
    },
    end: () => res.end()
  })
}

// ---------------------------------------------------------------------------
// Canlı yayını oynatıcıya parçalı MP4 olarak verme
//
// Sunucu canlı yayını gerçek zamanlı hızda damlatarak gönderir. mpegts.js bu
// damlayan veriyle ilk karede takılıp kalıyordu. ffmpeg yayını yeniden
// kodlamadan (-c:v copy) yarım saniyelik MP4 parçalarına böler, tarayıcının
// kendi oynatıcısı bunu doğrudan oynatır. Yalnızca ses AAC'ye çevrilir (bazı
// kanallardaki MP2 sesi tarayıcı MP4 içinde çalamıyor).
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
let proxyPort = 0

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

function handleRemux(target: string, back: number, res: http.ServerResponse): void {
  const bin = ffmpegPath()
  if (!bin || !proxyPort) {
    res.writeHead(503)
    res.end()
    return
  }
  activeRemux?.kill('SIGKILL')
  liveInfo = {}
  const input = `http://127.0.0.1:${proxyPort}/live?u=${encodeURIComponent(target)}&back=${back}`
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
      // 15 sn hiç veri gelmezse çık → oynatıcı yeniden bağlanır
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

// ---------- Çoklu ekran ----------
// Ek ekranlar ana oturumdan bağımsızdır: her biri sunucuya kendi bağlantısını
// açar (hesabın bağlantı sınırı arayüzde kontrol edilir).
const multiViewProcs = new Map<number, ChildProcess>()

function handleMultiView(target: string, slot: number, res: http.ServerResponse): void {
  const bin = ffmpegPath()
  if (!bin) {
    res.writeHead(503)
    res.end()
    return
  }
  multiViewProcs.get(slot)?.kill('SIGKILL')
  const proc = spawn(
    bin,
    [
      '-hide_banner',
      '-nostats',
      '-loglevel',
      'error',
      '-fflags',
      '+genpts+discardcorrupt',
      '-user_agent',
      USER_AGENT,
      '-reconnect',
      '1',
      '-reconnect_streamed',
      '1',
      '-reconnect_delay_max',
      '5',
      '-probesize',
      '1000000',
      '-analyzeduration',
      '1500000',
      '-rw_timeout',
      '15000000',
      '-i',
      target,
      '-map',
      '0:v:0',
      '-map',
      '0:a:0?',
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
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
    { stdio: ['ignore', 'pipe', 'ignore'] }
  )
  multiViewProcs.set(slot, proc)
  proc.stdout.on('data', (chunk: Buffer) => {
    if (!res.headersSent) res.writeHead(200, { 'Content-Type': 'video/mp4', 'Cache-Control': 'no-cache' })
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
    if (multiViewProcs.get(slot) === proc) multiViewProcs.delete(slot)
    if (!res.headersSent) res.writeHead(502)
    res.end()
  })
  res.on('close', () => proc.kill('SIGKILL'))
}

let started = false

export function initLive(): void {
  if (started) return
  started = true

  const proxyReady = new Promise<number>((resolve) => {
    const server = http.createServer((req, res) => {
      const reqUrl = new URL(req.url || '/', 'http://127.0.0.1')
      const target = reqUrl.searchParams.get('u')
      const back = Math.max(0, Math.min(150, Number(reqUrl.searchParams.get('back')) || 0))
      if (target && reqUrl.pathname === '/remux') {
        handleRemux(target, back, res)
      } else if (target && reqUrl.pathname === '/live') {
        void handleLive(target, back, res)
      } else if (target && reqUrl.pathname === '/mv') {
        const slot = Math.max(0, Math.min(3, Number(reqUrl.searchParams.get('slot')) || 0))
        handleMultiView(target, slot, res)
      } else if (reqUrl.pathname === '/file') {
        void serveFile(reqUrl.searchParams.get('p'), req, res)
      } else {
        res.writeHead(404)
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
  ipcMain.handle('proxy:canRemux', () => ffmpegPath() !== null)
  ipcMain.on('proxy:releaseLive', () => {
    activeRemux?.kill('SIGKILL')
    releaseLive()
  })
  ipcMain.handle('proxy:liveInfo', () => {
    // Son 5 saniyede sunucudan gelen veri miktarından yedek bit hızı
    const since = Date.now() - 5000
    let bytes = 0
    for (let i = ring.length - 1; i >= 0 && ring[i].t >= since; i--) bytes += ring[i].buf.length
    return {
      ...liveInfo,
      bitrateKbps: liveInfo.bitrateKbps ?? (bytes ? Math.round((bytes * 8) / 5 / 1000) : undefined),
      // Geri sarılabilecek süre (arabellekteki en eski veriden en yeniye, yayın zamanıyla)
      ringSec: ring.length ? Math.max(0, mediaEdge - ring[0].m) : 0,
      // Oynatıcıya iletilmeyi bekleyen veri (yayın zamanıyla sn)
      queuedSec: playerQueued ? playerQueued() : 0
    }
  })
}
