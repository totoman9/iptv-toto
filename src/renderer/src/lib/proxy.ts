// Ana süreçteki yerel canlı yayın aktarıcısının portu. Uygulama açılırken bir
// kez alınıp saklanır; oynatıcı motoru .ts canlı yayınları bu adres
// üzerinden çeker (bkz. src/main/index.ts — son 30 sn kesiti için).
let port = 0
let remux = false

export async function initProxy(): Promise<void> {
  try {
    port = await window.iptv.proxy.getPort()
    remux = port > 0 && (await window.iptv.proxy.canRemux())
  } catch {
    port = 0
    remux = false
  }
}

export function proxiedLiveUrl(url: string): string {
  if (!port) return url
  return `http://127.0.0.1:${port}/live?u=${encodeURIComponent(url)}`
}

// Canlı yayını ffmpeg ile parçalı MP4'e çevirip veren adres (tarayıcının
// kendi oynatıcısı doğrudan oynatır). backSec > 0: canlının o kadar
// saniye gerisinden (arabellekten) başlat — canlı yayını geri sarma.
export function remuxedLiveUrl(url: string, backSec = 0): string {
  const back = backSec > 0 ? `&back=${Math.round(backSec)}` : ''
  return `http://127.0.0.1:${port}/remux?u=${encodeURIComponent(url)}${back}`
}

// Bilgisayardaki bir kaydı (ileri/geri sarılabilir şekilde) oynatma adresi
export function localFileUrl(path: string): string {
  return `http://127.0.0.1:${port}/file?p=${encodeURIComponent(path)}`
}

// Çoklu ekran: her ekran (slot) sunucuya kendi bağlantısını açar
export function multiViewUrl(url: string, slot: number): string {
  return `http://127.0.0.1:${port}/mv?u=${encodeURIComponent(url)}&slot=${slot}`
}

export function isProxyAvailable(): boolean {
  return port > 0
}

export function isRemuxAvailable(): boolean {
  return remux
}
