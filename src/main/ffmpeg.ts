import { app } from 'electron'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'

// Uygulamayla gelen ffmpeg (geliştirmede resources/ffmpeg/<platform-mimari>,
// paketlenmiş uygulamada Resources/ffmpeg altında).
export function ffmpegPath(): string | null {
  const exe = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
  const candidates = app.isPackaged
    ? [join(process.resourcesPath, 'ffmpeg', exe)]
    : [join(app.getAppPath(), 'resources', 'ffmpeg', `${process.platform}-${process.arch}`, exe)]
  return candidates.find((p) => existsSync(p)) || null
}

export function runFfmpeg(args: string[], timeoutMs = 90_000): Promise<boolean> {
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

// Dosya adı: "<başlık> 2026-09-13 22.05.46"
export function clipFileBase(title: string): string {
  const d = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}`
  const safeTitle = title.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)
  return `${safeTitle || 'Kesit'} ${stamp}`
}

// .ts kaydını .mp4'e çevirir. Önce kayıpsız (yeniden kodlamadan) dener;
// olmazsa yalnızca sesi AAC'ye çevirir.
export async function finalizeToMp4(
  inputPath: string,
  outPath: string,
  inputArgs: string[] = [],
  outputArgs: string[] = [],
  timeoutMs = 90_000
): Promise<boolean> {
  const common = ['-y', '-hide_banner', '-loglevel', 'error', ...inputArgs]
  if (
    await runFfmpeg(
      [...common, '-i', inputPath, ...outputArgs, '-c', 'copy', '-movflags', '+faststart', outPath],
      timeoutMs
    )
  )
    return true
  return runFfmpeg(
    [
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
    ],
    timeoutMs
  )
}
