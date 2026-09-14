import { effectiveOmdbKey } from './settings'
import { fold } from './search'

// ---------------------------------------------------------------------------
// IMDb puanları (OMDb servisi üzerinden)
//
// Yalnızca bir film/dizi sayfası açılınca sorulur ve sonuç bilgisayarda
// saklanır (ücretsiz anahtarın günlük 1.000 istek sınırı rahat yetsin diye).
// Dizi bölüm puanları, sağlayıcıya yeni bölüm eklendiğinde ya da bir hafta
// geçince tazelenir.
// ---------------------------------------------------------------------------

export interface ImdbInfo {
  imdbId: string
  title: string
  year?: string
  rating?: number
  votes?: string
  rottenTomatoes?: string
  metascore?: string
  url: string
}

export interface ImdbEpisode {
  episode: number
  title: string
  rating?: number
}

export class NoOmdbKeyError extends Error {}

const TITLE_TTL_MS = 30 * 24 * 3600_000
const SERIES_TTL_MS = 7 * 24 * 3600_000
const SEASON_TTL_MS = 7 * 24 * 3600_000
// Yeni bölüm çıktıysa bile en fazla yarım günde bir tekrar sor
const SEASON_MIN_REFRESH_MS = 12 * 3600_000
const NOT_FOUND_TTL_MS = 7 * 24 * 3600_000

interface CacheEntry<T> {
  at: number
  data: T | null
}

type OmdbCache = Record<string, CacheEntry<unknown>>

const CACHE_KEY = 'omdb-cache'
let cache: OmdbCache | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null

async function loadCache(): Promise<OmdbCache> {
  if (!cache) cache = (await window.iptv.cache.read<OmdbCache>(CACHE_KEY)) || {}
  return cache
}

function saveCacheSoon(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    if (cache) void window.iptv.cache.write(CACHE_KEY, cache)
  }, 1500)
}

interface OmdbTitleResponse {
  Response: 'True' | 'False'
  Error?: string
  Title?: string
  Year?: string
  imdbID?: string
  imdbRating?: string
  imdbVotes?: string
  Ratings?: { Source: string; Value: string }[]
  Metascore?: string
  Search?: { Title: string; Year: string; imdbID: string; Type: string }[]
  Episodes?: { Title: string; Episode: string; imdbRating: string }[]
}

async function omdbGet(params: string, key?: string): Promise<OmdbTitleResponse | null> {
  const apiKey = key ?? effectiveOmdbKey()
  if (!apiKey) throw new NoOmdbKeyError('OMDb anahtarı yok')
  const res = await window.iptv.http.fetchJson<OmdbTitleResponse>(
    `https://www.omdbapi.com/?${params}&apikey=${encodeURIComponent(apiKey)}`,
    { timeoutMs: 12000 }
  )
  if (!res.ok || !res.data) throw new Error(res.error || 'OMDb yanıt vermedi')
  if (res.data.Response === 'False') {
    const err = res.data.Error || ''
    if (/invalid api key|no api key/i.test(err)) throw new Error('OMDb anahtarı geçersiz ya da henüz etkinleştirilmemiş')
    if (/limit/i.test(err)) throw new Error('OMDb günlük istek sınırı doldu')
    return null
  }
  return res.data
}

function toNumber(v?: string): number | undefined {
  const n = v ? parseFloat(v) : NaN
  return Number.isFinite(n) ? n : undefined
}

function toInfo(d: OmdbTitleResponse): ImdbInfo | null {
  if (!d.imdbID) return null
  return {
    imdbId: d.imdbID,
    title: d.Title || '',
    year: d.Year,
    rating: toNumber(d.imdbRating),
    votes: d.imdbVotes && d.imdbVotes !== 'N/A' ? d.imdbVotes : undefined,
    rottenTomatoes: d.Ratings?.find((r) => r.Source === 'Rotten Tomatoes')?.Value,
    metascore: d.Metascore && d.Metascore !== 'N/A' ? d.Metascore : undefined,
    url: `https://www.imdb.com/title/${d.imdbID}/`
  }
}

// Sağlayıcı adlarındaki süsleri temizle: "TR: Menajerimi Arayın! (Film) (2026)"
// → { title: "Menajerimi Arayın!", year: "2026" }
export function cleanTitle(name: string): { title: string; year?: string } {
  const year = name.match(/\((19|20)\d{2}\)/)?.[0].slice(1, 5) ?? name.match(/\b(19|20)\d{2}\b\s*$/)?.[0]
  const title = name
    .replace(/^\s*(\|[^|]*\||\[[^\]]*\]|[A-Z]{2,3}\s*[:|-])\s*/, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\b(4k|uhd|fhd|hd|1080p|720p|altyaz[ıi]l[ıi]|dublaj|tr dublaj)\b/gi, ' ')
    .replace(/\b(19|20)\d{2}\s*$/, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return { title, year }
}

export async function lookupImdb(
  names: (string | undefined)[],
  year: string | undefined,
  type: 'movie' | 'series'
): Promise<ImdbInfo | null> {
  const candidates = [...new Set(names.filter(Boolean).map((n) => cleanTitle(n!).title).filter((t) => t.length > 1))]
  if (candidates.length === 0) return null
  const c = await loadCache()
  const key = `t:${type}:${fold(candidates[0])}:${year ?? ''}`
  const hit = c[key] as CacheEntry<ImdbInfo> | undefined
  const ttl = hit?.data ? (type === 'series' ? SERIES_TTL_MS : TITLE_TTL_MS) : NOT_FOUND_TTL_MS
  if (hit && Date.now() - hit.at < ttl) return hit.data

  let found: ImdbInfo | null = null
  for (const title of candidates) {
    const t = encodeURIComponent(title)
    const d =
      (year ? await omdbGet(`t=${t}&y=${year}&type=${type}`) : null) ?? (await omdbGet(`t=${t}&type=${type}`))
    found = d ? toInfo(d) : null
    if (found) break
    // Tam ad tutmadıysa arama yap, yılı tutan ilk sonucu seç
    const s = await omdbGet(`s=${t}&type=${type}`)
    const pick = s?.Search?.find((r) => !year || r.Year.startsWith(year)) ?? (year ? undefined : s?.Search?.[0])
    if (pick) {
      const full = await omdbGet(`i=${pick.imdbID}`)
      found = full ? toInfo(full) : null
      if (found) break
    }
  }
  c[key] = { at: Date.now(), data: found }
  saveCacheSoon()
  return found
}

// Bir sezonun bölüm puanları. expectedCount: sağlayıcıdaki bölüm sayısı —
// saklanandan fazlaysa (yeni bölüm eklendi) yeniden sorulur.
export async function seasonRatings(
  imdbId: string,
  season: number,
  expectedCount: number
): Promise<ImdbEpisode[]> {
  const c = await loadCache()
  const key = `s:${imdbId}:${season}`
  const hit = c[key] as CacheEntry<ImdbEpisode[]> | undefined
  if (hit?.data) {
    const age = Date.now() - hit.at
    const rated = hit.data.filter((e) => e.rating !== undefined).length
    const hasNew = expectedCount > rated
    if (age < SEASON_TTL_MS && (!hasNew || age < SEASON_MIN_REFRESH_MS)) return hit.data
  }
  const d = await omdbGet(`i=${imdbId}&Season=${season}`)
  const episodes: ImdbEpisode[] = (d?.Episodes || []).map((e) => ({
    episode: parseInt(e.Episode, 10),
    title: e.Title,
    rating: toNumber(e.imdbRating)
  }))
  c[key] = { at: Date.now(), data: episodes }
  saveCacheSoon()
  return episodes
}

// Ayarlar ekranındaki "Test et": anahtar çalışıyor mu
export async function testOmdbKey(key: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const d = await omdbGet('i=tt0111161', key.trim())
    return d?.imdbID ? { ok: true } : { ok: false, error: 'Beklenmeyen yanıt' }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Bağlantı hatası' }
  }
}
