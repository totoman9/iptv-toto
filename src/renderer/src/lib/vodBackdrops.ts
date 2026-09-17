import { createPersisted } from './persisted'

// Filmlerin GENİŞ (yatay) görsel adresi, dizilerin aksine liste verisinde
// gelmiyor; her film için ayrı ayrı "film detayı" sorulması gerekiyor.
// Vitrin yalnızca geniş görseli olanları gösterdiği için bunu her açılışta
// baştan sormak, vitrinin birkaç saniye boş kalmasına (ve sağlayıcıya
// gereksiz yüke) yol açıyordu. Öğrendiğimizi diske yazıyoruz: ilk turdan
// sonra vitrin anında ve sağlayıcı erişilemez olsa bile doğru geliyor.
//
// Değer: geniş görsel adresi, ya da "bu filmde geniş görsel yok" demek için
// boş metin.
const store = createPersisted<Record<string, string>>('vod-backdrops', {})
const MAX_ENTRIES = 3000

let map: Record<string, string> = {}

export async function initVodBackdrops(): Promise<void> {
  await store.init()
  map = { ...store.get() }
}

// undefined = henüz bilmiyoruz, '' = geniş görseli yok, dolu = adres
export function getKnownBackdrop(id: string): string | undefined {
  return map[id]
}

export function rememberBackdrop(id: string, backdrop: string | null): void {
  const next = backdrop || ''
  if (map[id] === next) return
  map[id] = next
  const keys = Object.keys(map)
  if (keys.length > MAX_ENTRIES) {
    for (const k of keys.slice(0, keys.length - MAX_ENTRIES)) delete map[k]
  }
  store.set({ ...map }, 2000)
}
