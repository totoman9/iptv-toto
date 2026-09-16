import type { Channel } from '../../../shared/types'

// Aynı kanalın farklı kalite kopyalarını ("beIN Sports 1 HD" / "... 4K" / "...
// UHD") tek kartta birleştirmek için: isimden kalite/kodek etiketlerini
// ayıklayıp geri kalan "temel isim" aynıysa (ve aynı kategorideyse) aynı
// gruba koyuyoruz.

export type ChannelQualityBadge = 'LQ' | 'SD' | 'HD' | 'FHD' | 'UHD' | '4K' | 'YDK'

const QUALITY_RANK: Record<ChannelQualityBadge, number> = {
  LQ: -1,
  SD: 0,
  HD: 1,
  YDK: 1,
  FHD: 2,
  UHD: 3,
  '4K': 4
}

// Bazı sağlayıcılar kanal adlarında süslü "küçük büyük harf" / üst simge
// Unicode karakterleri kullanıyor (ör. "beIN SPORTS 1 ʜᴅ", "beIN SPORTS 1 ⁴ᴷ")
// — bunlar normal HD/4K harfleriyle aynı görünse de farklı kod noktaları
// olduğu için düz regex'e yakalanmıyor, gruplama tamamen bozuluyordu. Önce
// bunları sıradan harfe çeviriyoruz.
const FANCY_LETTERS: Record<string, string> = {
  ᴀ: 'A', ʙ: 'B', ᴄ: 'C', ᴅ: 'D', ᴇ: 'E', ꜰ: 'F', ɢ: 'G', ʜ: 'H', ɪ: 'I',
  ᴊ: 'J', ᴋ: 'K', ʟ: 'L', ᴍ: 'M', ɴ: 'N', ᴏ: 'O', ᴘ: 'P', ǫ: 'Q', ʀ: 'R',
  ꜱ: 'S', ᴛ: 'T', ᴜ: 'U', ᴠ: 'V', ᴡ: 'W', ʏ: 'Y', ᴢ: 'Z',
  ᴬ: 'A', ᴰ: 'D', ᴴ: 'H', ᴷ: 'K', ᴹ: 'M', ᴺ: 'N', ᴼ: 'O', ᴾ: 'P', ᴿ: 'R',
  ᵁ: 'U', ⱽ: 'V', ᵂ: 'W',
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6',
  '⁷': '7', '⁸': '8', '⁹': '9'
}
const FANCY_CHAR = new RegExp(Object.keys(FANCY_LETTERS).join('|'), 'g')

function normalizeFancy(name: string): string {
  return name.replace(FANCY_CHAR, (ch) => FANCY_LETTERS[ch] || ch)
}

const QUALITY_TOKEN = /\b(4K|UHD|FHD|YDK|HD|SD|LQ)\b/i
// baseChannelName isimdeki TÜM kalite etiketlerini silmeli (ör. "UHD YDK"
// gibi ikisini birden yazan kanallar da olabiliyor) — detectBadge ise
// yalnızca birincisini okuyor, o yüzden ayrı (global olmayan) regex kalıyor.
const QUALITY_TOKEN_G = /\b(4K|UHD|FHD|YDK|HD|SD|LQ)\b/gi
// Kalite değil ama isimde gürültü olarak geçen kodek/format etiketleri
const NOISE_TOKEN = /\b(HEVC|H\.?265|H\.?264|10\s?BIT|8\s?BIT)\b/gi

export interface ChannelVariant {
  channel: Channel
  badge: ChannelQualityBadge | null
  rank: number
}

export interface ChannelGroup {
  key: string
  baseName: string
  group: string
  variants: ChannelVariant[]
}

function detectBadge(name: string): ChannelQualityBadge | null {
  const m = normalizeFancy(name).match(QUALITY_TOKEN)
  return m ? (m[1].toUpperCase() as ChannelQualityBadge) : null
}

// Bazı sağlayıcılar aynı kaliteden yedek akışı ayırt etmek için ismin sonuna
// üst simge bir sayı ekliyor (ör. "... HD ¹" / "... HD ²"). Bunu düz rakama
// çevirmeden ÖNCE (hâlâ üst simgeyken, yani gerçek kanal numarasıyla
// karışma riski yokken) ayıklıyoruz — "beIN Sports 1"deki normal "1"
// kanal numarasına dokunulmuyor.
const TRAILING_SUPERSCRIPT = /\s[⁰¹²³⁴⁵⁶⁷⁸⁹]+\s*$/

export function baseChannelName(name: string): string {
  return normalizeFancy(name.replace(TRAILING_SUPERSCRIPT, ' '))
    .replace(NOISE_TOKEN, ' ')
    .replace(QUALITY_TOKEN_G, ' ')
    .replace(/[|/_]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/[\s-]+$/, '')
    .trim()
}

// Bazı sağlayıcılar kalite kopyalarını aynı kategoriye değil, ayrı bir
// kategoriye koyuyor (ör. "TR ULUSAL" ve "TR ULUSAL UHD" iki AYRI kategori,
// içindeki kanallar aynı). Kategori adından da kalite etiketini silip
// öyle karşılaştırıyoruz — böylece bu ikisi aynı sayılır ama "TR BEIN
// SPORTS" ile "TR BEIN SPORTS VIP" (gerçekten farklı bir paket) ayrı kalır.
function normalizeCategoryName(group: string): string {
  return normalizeFancy(group).replace(QUALITY_TOKEN_G, ' ').replace(/\s{2,}/g, ' ').trim()
}

// Aynı (kaliteden arındırılmış) kategori + aynı temel isimdeki kanalları tek
// grupta toplar. Kalite rozeti olmayan (etiketsiz) bir kopya varsa
// görüntülenecek temel isim onun ham adı olur — genelde en "temiz" isim odur.
export function groupChannels(channels: Channel[]): ChannelGroup[] {
  const map = new Map<string, ChannelGroup>()
  for (const channel of channels) {
    const base = baseChannelName(channel.name) || channel.name
    const categoryKey = normalizeCategoryName(channel.group) || channel.group
    const key = `${categoryKey.toLocaleUpperCase('tr')}::${base.toLocaleUpperCase('tr')}`
    const badge = detectBadge(channel.name)
    const rank = badge ? QUALITY_RANK[badge] : 1
    let entry = map.get(key)
    if (!entry) {
      entry = { key, baseName: base, group: channel.group, variants: [] }
      map.set(key, entry)
    }
    if (!badge) entry.baseName = base
    entry.variants.push({ channel, badge, rank })
  }
  for (const entry of map.values()) {
    entry.variants.sort((a, b) => b.rank - a.rank)
  }
  return [...map.values()]
}
