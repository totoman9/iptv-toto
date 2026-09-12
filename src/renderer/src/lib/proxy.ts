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
// kendi oynatıcısı doğrudan oynatır)
export function remuxedLiveUrl(url: string): string {
  return `http://127.0.0.1:${port}/remux?u=${encodeURIComponent(url)}`
}

export function isProxyAvailable(): boolean {
  return port > 0
}

export function isRemuxAvailable(): boolean {
  return remux
}
