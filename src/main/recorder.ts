import { app, BrowserWindow, ipcMain, powerSaveBlocker, shell } from 'electron'
import { join } from 'node:path'
import { createWriteStream, type WriteStream } from 'node:fs'
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import type { RecordingEntry, RecordingInput, RecordingScheduleResult } from '../shared/types'
import { clipFileBase, finalizeToMp4 } from './ffmpeg'
import { allowFileRoot, ensureSession, subscribe } from './live'
import { log } from './log'

// ---------------------------------------------------------------------------
// Program kaydı
//
// Kayıt, canlı yayın oturumunun "kayıt" abonesidir: sunucuya yeni bağlantı
// açmaz, oynatıcıyla aynı bağlantıyı paylaşır. Böylece kaydedilen kanal
// izlenmeye devam edilebilir. Tek bağlantılı hesaplarda kayıt sürerken başka
// kanal açılamaz (live.ts bunu engeller).
//
// Planlanan kayıtlar için uygulamanın açık olması gerekir.
// ---------------------------------------------------------------------------

interface ActiveRecording {
  entry: RecordingEntry
  file: WriteStream
  partPath: string
  unsubscribe: (() => void) | null
  reconnectTimer: ReturnType<typeof setTimeout> | null
  bytes: number
  blockerId: number
}

let entries: RecordingEntry[] = []
let loaded = false
let active: ActiveRecording | null = null

export function recordingsDir(): string {
  return join(app.getPath('videos'), 'IPTV Toto Kayıtlar')
}

function storePath(): string {
  return join(app.getPath('userData'), 'recordings.json')
}

async function ensureLoaded(): Promise<void> {
  if (loaded) return
  try {
    entries = JSON.parse(await readFile(storePath(), 'utf-8'))
  } catch {
    entries = []
  }
  loaded = true
  // Uygulama kayıt sürerken kapandıysa yarım kalanları işaretle
  for (const e of entries) {
    if (e.status === 'recording') {
      e.status = 'failed'
      e.error = 'Uygulama kapandığı için kayıt yarıda kaldı'
      void log('warn', 'recorder', `Yarım kalan kayıt: ${e.title} (${e.channelName})`)
    }
  }
}

async function persist(): Promise<void> {
  await mkdir(app.getPath('userData'), { recursive: true })
  await writeFile(storePath(), JSON.stringify(entries, null, 2), 'utf-8')
}

function notify(): void {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('rec:changed')
  void persist()
}

const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }): boolean =>
  a.start < b.end && b.start < a.end

function attach(a: ActiveRecording): void {
  const s = ensureSession(a.entry.url)
  if (!s) {
    scheduleReconnect(a, 5000)
    return
  }
  a.unsubscribe = subscribe(s, {
    kind: 'recorder',
    write: (buf) => {
      a.bytes += buf.length
      a.file.write(buf)
    },
    // Sunucu bağlantısı koptu: kayıt süresi bitmediyse yeniden bağlan
    end: () => {
      a.unsubscribe = null
      scheduleReconnect(a, 3000)
    }
  })
  void s.ready.then((r) => {
    if (!r.ok && active === a) {
      a.unsubscribe?.()
      a.unsubscribe = null
      scheduleReconnect(a, 5000)
    }
  })
}

function scheduleReconnect(a: ActiveRecording, delayMs: number): void {
  if (active !== a || Date.now() >= a.entry.end || a.reconnectTimer) return
  a.reconnectTimer = setTimeout(() => {
    a.reconnectTimer = null
    if (active === a) attach(a)
  }, delayMs)
}

async function startRecording(entry: RecordingEntry): Promise<void> {
  if (active) return
  const dir = recordingsDir()
  await mkdir(dir, { recursive: true })
  const partPath = join(dir, `${clipFileBase(entry.title)}.ts.part`)
  entry.status = 'recording'
  entry.path = undefined
  entry.error = undefined
  const a: ActiveRecording = {
    entry,
    file: createWriteStream(partPath),
    partPath,
    unsubscribe: null,
    reconnectTimer: null,
    bytes: 0,
    // Kayıt sürerken bilgisayar uykuya geçip kaydı kesmesin
    blockerId: powerSaveBlocker.start('prevent-app-suspension')
  }
  active = a
  attach(a)
  notify()
}

async function stopRecording(): Promise<void> {
  const a = active
  if (!a) return
  active = null
  if (a.reconnectTimer) clearTimeout(a.reconnectTimer)
  a.unsubscribe?.()
  powerSaveBlocker.stop(a.blockerId)
  await new Promise<void>((resolve) => a.file.end(() => resolve()))

  const e = a.entry
  if (a.bytes < 188 * 1000) {
    e.status = 'failed'
    e.error = 'Kanaldan görüntü alınamadı'
    void log('error', 'recorder', `Kayıt başarısız (görüntü alınamadı): ${e.title} (${e.channelName})`)
    await unlink(a.partPath).catch(() => {})
    notify()
    return
  }
  // Dosya hazırlanırken listede "kaydediliyor" yerine "tamamlandı" görünsün
  e.status = 'done'
  notify()
  const mp4 = a.partPath.replace(/\.ts\.part$/, '.mp4')
  // Uzun kayıtlarda dönüştürme sürebilir (yeniden kodlama yok, sadece kopya)
  if (await finalizeToMp4(a.partPath, mp4, ['-fflags', '+genpts'], [], 30 * 60_000)) {
    await unlink(a.partPath).catch(() => {})
    e.path = mp4
  } else {
    const ts = a.partPath.replace(/\.part$/, '')
    await rename(a.partPath, ts).catch(() => {})
    e.path = ts
  }
  try {
    e.sizeBytes = (await stat(e.path)).size
  } catch {
    /* ignore */
  }
  notify()
}

function tick(): void {
  const now = Date.now()
  if (active && now >= active.entry.end) {
    void stopRecording()
    return
  }
  if (active) return
  const due = entries.find((e) => e.status === 'scheduled' && e.start <= now + 3000)
  if (!due) return
  if (due.end <= now) {
    due.status = 'failed'
    due.error = 'Kayıt saati kaçırıldı (uygulama kapalıydı)'
    void log('warn', 'recorder', `Kayıt saati kaçırıldı: ${due.title} (${due.channelName})`)
    notify()
  } else {
    void startRecording(due)
  }
}

let started = false

export function initRecorder(): void {
  if (started) return
  started = true
  allowFileRoot(recordingsDir())
  void ensureLoaded()
  setInterval(tick, 5000)

  ipcMain.handle('rec:list', async () => {
    await ensureLoaded()
    if (active) active.entry.sizeBytes = active.bytes
    return entries
  })

  ipcMain.handle('rec:schedule', async (_event, input: RecordingInput): Promise<RecordingScheduleResult> => {
    await ensureLoaded()
    if (input.end <= Date.now()) return { ok: false, error: 'Bu program bitmiş.' }
    const pending = entries.filter((e) => e.status === 'scheduled' || e.status === 'recording')
    const same = pending.find((e) => e.url === input.url && overlaps(e, input))
    if (same) return { ok: false, error: 'Bu program zaten kaydediliyor ya da kaydedilecek.' }
    const clash = pending.find((e) => overlaps(e, input))
    if (clash) {
      return {
        ok: false,
        error: `Bu saatte “${clash.title}” kaydı var. Hesap aynı anda tek bağlantıya izin verdiği için iki kanal birlikte kaydedilemez.`
      }
    }
    const entry: RecordingEntry = {
      ...input,
      id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      status: 'scheduled'
    }
    entries.unshift(entry)
    notify()
    tick()
    return { ok: true, entry }
  })

  // Süren kaydı durdur ya da planlanmış kaydı iptal et
  ipcMain.handle('rec:stop', async (_event, id: string) => {
    await ensureLoaded()
    if (active?.entry.id === id) {
      active.entry.end = Date.now()
      await stopRecording()
      return true
    }
    const e = entries.find((x) => x.id === id)
    if (e && e.status === 'scheduled') {
      e.status = 'cancelled'
      notify()
    }
    return true
  })

  ipcMain.handle('rec:remove', async (_event, id: string, deleteFile: boolean) => {
    await ensureLoaded()
    if (active?.entry.id === id) return false
    const e = entries.find((x) => x.id === id)
    if (!e) return false
    if (deleteFile && e.path) await unlink(e.path).catch(() => {})
    entries = entries.filter((x) => x.id !== id)
    notify()
    return true
  })

  ipcMain.handle('rec:openFolder', async () => {
    const dir = recordingsDir()
    await mkdir(dir, { recursive: true })
    await shell.openPath(dir)
  })

  // Kayıt sürerken uygulama kapatılırsa önce kaydı düzgünce bitir
  let quitting = false
  app.on('before-quit', (event) => {
    if (!active || quitting) return
    event.preventDefault()
    quitting = true
    active.entry.end = Date.now()
    void stopRecording().finally(() => app.quit())
  })
}
