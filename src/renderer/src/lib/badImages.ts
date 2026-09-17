import { useEffect, useState } from 'react'
import { createPersisted } from './persisted'

// Yüklenemeyen görseller hakkında öğrendiklerimiz.
//
// İki seviyede öğreniyoruz, çünkü sorunun büyük kısmı tek tek bozuk link
// değil: sağlayıcının görsel sunucularından biri komple erişilemez oluyor ve o
// sunucuda on binlerce adres var. Adresleri tek tek öğrenmek o yarışı asla
// kazanamaz — bu yüzden bir sunucudan üst üste yeterince hata gelir ve o
// sunucudan hiç başarılı yükleme olmadıysa, o sunucunun tamamını "bu adresleri
// hiç deneme" diye işaretliyoruz. Bir görsel oradan yüklenmeyi başarırsa
// sunucu anında affediliyor.
const urlStore = createPersisted<string[]>('bad-image-urls', [])
const hostStore = createPersisted<string[]>('bad-image-hosts', [])

// Bir sunucunun tamamını kapatmadan önce beklediğimiz hata sayısı
const HOST_FAIL_LIMIT = 8
// Yeni bir şey öğrenildiğinde sıralamayı hemen değil, toplu olarak
// tazeliyoruz (bkz. useBadImagesVersion)
const NOTIFY_COALESCE_MS = 2500

let badUrls = new Set<string>()
let badHosts = new Set<string>()
const okHosts = new Set<string>()
const hostFails = new Map<string, number>()
const listeners = new Set<() => void>()

function hostOf(url: string): string {
  const start = url.indexOf('//')
  if (start < 0) return ''
  const rest = url.slice(start + 2)
  const end = rest.search(/[/?#]/)
  return (end < 0 ? rest : rest.slice(0, end)).toLowerCase()
}

export async function initBadImages(): Promise<void> {
  await Promise.all([urlStore.init(), hostStore.init()])
  badUrls = new Set(urlStore.get())
  badHosts = new Set(hostStore.get())
}

export function isBadImage(url?: string): boolean {
  if (!url) return false
  if (badUrls.has(url)) return true
  const host = hostOf(url)
  return !!host && badHosts.has(host)
}

// Yeni bir şey öğrenildi — sıralamaları yeniden hesaplayacak olanlara haber
// ver. Her tek keşifte haber vermiyoruz: onlarca görsel aynı anda düşerken
// her seferinde tüm listeyi yeniden çizmek, kartların "yüklenmiyor" sayacını
// sürekli sıfırlayıp hiçbirinin yer tutucuya düşememesine yol açıyordu.
let notifyTimer: ReturnType<typeof setTimeout> | null = null
function scheduleNotify(): void {
  if (notifyTimer) return
  notifyTimer = setTimeout(() => {
    notifyTimer = null
    for (const fn of listeners) fn()
  }, NOTIFY_COALESCE_MS)
}

export function markImageBad(url?: string): void {
  if (!url) return
  const host = hostOf(url)
  let learned = false

  if (!badUrls.has(url)) {
    badUrls.add(url)
    let arr = Array.from(badUrls)
    if (arr.length > 4000) arr = arr.slice(arr.length - 4000)
    urlStore.set(arr, 1500)
    learned = true
  }

  if (host && !okHosts.has(host) && !badHosts.has(host)) {
    const fails = (hostFails.get(host) ?? 0) + 1
    hostFails.set(host, fails)
    if (fails >= HOST_FAIL_LIMIT) {
      badHosts.add(host)
      hostStore.set(Array.from(badHosts), 1500)
      learned = true
    }
  }

  if (learned) scheduleNotify()
}

// Bir görsel yüklenebildiyse o sunucu sağlam demektir: sayacı sıfırla, daha
// önce yanlışlıkla kapattıysak (geçici kesinti) hemen geri aç.
export function markImageOk(url?: string): void {
  if (!url) return
  const host = hostOf(url)
  if (!host || okHosts.has(host)) return
  okHosts.add(host)
  hostFails.delete(host)
  if (badHosts.delete(host)) {
    hostStore.set(Array.from(badHosts), 1500)
    scheduleNotify()
  }
}

// Bir adresi ilk ne zaman denemeye başladığımız. Liste kayarken kartlar
// silinip yeniden çiziliyor; her yeniden çizimde sayaç sıfırdan başlasaydı
// yavaş sunucudaki bir görsel hiçbir zaman "açılmıyor" sayılamazdı. Bu yüzden
// bekleme süresini adrese göre sayıyoruz, karta göre değil.
const firstSeen = new Map<string, number>()

export function remainingProbeMs(url: string, totalMs: number): number {
  const now = Date.now()
  const started = firstSeen.get(url)
  if (started === undefined) {
    if (firstSeen.size > 4000) firstSeen.clear()
    firstSeen.set(url, now)
    return totalMs
  }
  return Math.max(250, totalMs - (now - started))
}

// Kayıt her büyüdüğünde artan bir sayaç — sıralama hesaplayan useMemo'ların
// bağımlılık dizisine eklenip yeni bozuk adres öğrenilince yeniden
// hesaplanmasını (ve afişsizlerin listenin sonuna kaymasını) sağlar.
export function useBadImagesVersion(): number {
  const [v, setV] = useState(0)
  useEffect(() => {
    const fn = (): void => setV((x) => x + 1)
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  }, [])
  return v
}
