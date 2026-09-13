import type { Channel, EpgProgram, XtreamSourceConfig } from '../../../shared/types'
import { getShortEpg } from './xtream'

// Rehber dizini arka planda çalıştığı için istekleri çok daha seyrek atıyoruz:
// panellerin flood koruması kısa sürede çok istek atan adresi engelliyor.
const INDEX_REQUEST_GAP_MS = 1500
// Art arda bu kadar hata gelirse (sunucu engelledi / kapalı) toplamayı bırak
const MAX_FAILURES_IN_ROW = 3

// ---------------------------------------------------------------------------
// Rehber dizini: seçili kanalların önümüzdeki programları. "Şimdi yayında",
// "Maç merkezi", program araması ve hatırlatıcılar bunu kullanır.
//
// Sağlayıcının toplu rehber dosyası (xmltv) neredeyse boş olduğu için
// programları kanal kanal, sırayla (sunucu paralel isteği kaldıramıyor)
// topluyoruz. Yaklaşık 200 kanal ~1 dakika sürer; sonuç önbelleğe yazılır ve
// 3 saatte bir arka planda tazelenir.
// ---------------------------------------------------------------------------

export interface IndexedChannel {
  channelId: string
  streamId: number
  name: string
  logo?: string
  group: string
  programs: EpgProgram[]
}

export interface EpgIndexCache {
  version: 1
  savedAt: number
  channels: IndexedChannel[]
  // Program bilgisi olmayan kanallar (her seferinde tekrar sorulmasın)
  emptyIds: string[]
}

export const EPG_INDEX_REFRESH_MS = 6 * 60 * 60 * 1000
const MAX_CHANNELS = 120

const SPORT_GROUP = /spor|sport|bein|exxen|tabii|saran|tivibu/i
const MAIN_GROUP = /ulusal|haber|news/i

export function isSportsChannel(ch: { group: string; name: string }): boolean {
  return SPORT_GROUP.test(ch.group) || SPORT_GROUP.test(ch.name)
}

// Hangi kanalların rehberi toplanacak: favoriler + Türk ulusal / spor / haber
// kategorileri (UHD kopyaları ve yerel kanallar hariç). Türkçe kategori
// yoksa sağlayıcının ilk birkaç kategorisi.
export function pickIndexChannels(
  channels: Channel[],
  order: string[],
  favoriteIds: Set<string>
): Channel[] {
  const out: Channel[] = []
  const seen = new Set<string>()
  const add = (c: Channel): void => {
    if (c.streamId === undefined || seen.has(c.id) || out.length >= MAX_CHANNELS) return
    seen.add(c.id)
    out.push(c)
  }
  for (const c of channels) if (favoriteIds.has(c.id)) add(c)

  const turkish = order.filter((g) => /^tr\b|türk|turk/i.test(g))
  const pool = turkish.length > 0 ? turkish : order.slice(0, 6)
  const preferred = pool.filter(
    (g) => (SPORT_GROUP.test(g) || MAIN_GROUP.test(g)) && !/uhd|4k|yerel/i.test(g)
  )
  const chosen = preferred.length > 0 ? preferred : pool.slice(0, 4)

  const byGroup = new Map<string, Channel[]>()
  for (const c of channels) {
    const list = byGroup.get(c.group)
    if (list) list.push(c)
    else byGroup.set(c.group, [c])
  }
  for (const g of chosen) for (const c of byGroup.get(g) || []) add(c)
  return out
}

export async function buildEpgIndex(
  cfg: XtreamSourceConfig,
  list: Channel[],
  onProgress: (partial: IndexedChannel[], done: number, total: number) => void,
  cancelled: () => boolean
): Promise<{ channels: IndexedChannel[]; emptyIds: string[]; blocked: boolean } | null> {
  const channels: IndexedChannel[] = []
  const emptyIds: string[] = []
  let failuresInRow = 0
  for (let i = 0; i < list.length; i++) {
    if (cancelled()) return null
    if (i > 0) await new Promise((r) => setTimeout(r, INDEX_REQUEST_GAP_MS))
    if (cancelled()) return null
    const c = list[i]
    let programs: EpgProgram[] = []
    try {
      programs = await getShortEpg(cfg, c.streamId!, 40)
      failuresInRow = 0
    } catch {
      // Hata "program yok" sayılmaz; art arda hata gelirse sunucuyu rahat bırak
      failuresInRow++
      if (failuresInRow >= MAX_FAILURES_IN_ROW) {
        onProgress([...channels], i + 1, list.length)
        return { channels, emptyIds, blocked: true }
      }
      continue
    }
    if (programs.length > 0) {
      channels.push({
        channelId: c.id,
        streamId: c.streamId!,
        name: c.name,
        logo: c.logo,
        group: c.group,
        programs
      })
    } else {
      emptyIds.push(c.id)
    }
    if (i % 10 === 9 || i === list.length - 1) onProgress([...channels], i + 1, list.length)
  }
  return { channels, emptyIds, blocked: false }
}

// ---------- Maç tespiti ----------

const VERSUS = /\s(-|–|vs\.?|v)\s/i
const SPORT_WORDS =
  /maç|süper lig|super lig|1\. lig|tff|uefa|şampiyonlar|champions|avrupa lig|europa|konferans lig|premier lig|premier league|laliga|la liga|serie a|bundesliga|ligue 1|nba|euroleague|eurocup|basketbol|voleybol|formula|motogp|tenis|derbi|milli takım/i
// Maç olmayan spor programları (özet, gol derlemesi, stüdyo, tartışma…)
const NOT_A_MATCH =
  /özet|ozet|golleri|goller\b|haftanın|highlights|stüdyo|studyo|gündem|gundem|magazin|analiz|haber|yorum|program|tartışma/i

export function isMatchProgram(ch: { group: string; name: string }, p: EpgProgram): boolean {
  if (!isSportsChannel(ch) || NOT_A_MATCH.test(p.title)) return false
  return VERSUS.test(p.title) || SPORT_WORDS.test(p.title)
}

export function isReplay(p: EpgProgram): boolean {
  return /tekrar|\(t\)|replay|banttan/i.test(p.title)
}

export function currentProgram(ch: IndexedChannel, now: number): EpgProgram | undefined {
  return ch.programs.find((p) => p.start <= now && p.end > now)
}

export function nextProgram(ch: IndexedChannel, now: number): EpgProgram | undefined {
  return ch.programs.find((p) => p.start > now)
}
