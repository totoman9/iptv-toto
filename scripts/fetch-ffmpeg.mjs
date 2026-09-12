// Kesit özelliği (son 30 sn'yi MP4 olarak kaydet) için gereken ffmpeg
// ikililerini indirir. Dosyalar büyük olduğu için git'e konmuyor; paketlemeden
// önce bir kez çalıştır:  npm run fetch:ffmpeg
//
// Kaynak: ffmpeg-static paketinin resmi GitHub sürümleri.
import { execSync } from 'node:child_process'
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const TARGETS = [
  { platform: 'darwin', arch: 'arm64', file: 'ffmpeg' },
  { platform: 'win32', arch: 'x64', file: 'ffmpeg.exe' }
]

for (const t of TARGETS) {
  const work = mkdtempSync(join(tmpdir(), 'ffmpeg-fetch-'))
  try {
    execSync('npm init -y', { cwd: work, stdio: 'ignore' })
    execSync('npm install ffmpeg-static@5.3.0 --foreground-scripts --no-audit --no-fund', {
      cwd: work,
      stdio: 'inherit',
      env: { ...process.env, npm_config_platform: t.platform, npm_config_arch: t.arch }
    })
    const dest = join(ROOT, 'resources', 'ffmpeg', `${t.platform}-${t.arch}`)
    mkdirSync(dest, { recursive: true })
    copyFileSync(join(work, 'node_modules', 'ffmpeg-static', t.file), join(dest, t.file))
    if (t.platform !== 'win32') chmodSync(join(dest, t.file), 0o755)
    console.log(`✓ ${t.platform}-${t.arch}`)
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}
