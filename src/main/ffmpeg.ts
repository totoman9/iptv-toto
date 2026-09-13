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
