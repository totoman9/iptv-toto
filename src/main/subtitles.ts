import { app, ipcMain } from 'electron'
import { join } from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import type { SubtitleResult, SubtitleSearchParams } from '../shared/types'
import { decodeSecret, encodeSecret } from './crypto'

// ---------------------------------------------------------------------------
// İnternetten altyazı (OpenSubtitles)
//
// Kullanıcının API anahtarı, kullanıcı adı ve şifresi bu bilgisayarda
// şifrelenmiş olarak saklanır (sistem anahtarlığıyla); şifre arayüze hiç geri
// gönderilmez. Giriş ve indirme işlemleri burada (ana süreçte) yapılır.
// ---------------------------------------------------------------------------

const API = 'https://api.opensubtitles.com/api/v1'
const USER_AGENT = 'IPTVToto v0.1'

interface Secrets {
  apiKey?: string
  username?: string
  password?: string
}

let secrets: Secrets | null = null
let token: { value: string; at: number; base: string } | null = null

const secretsFile = (): string => join(app.getPath('userData'), 'secrets.json')

async function loadSecrets(): Promise<Secrets> {
  if (secrets) return secrets
  try {
    const raw = JSON.parse(await readFile(secretsFile(), 'utf-8'))
    secrets = {
      apiKey: decodeSecret(raw.osApiKey),
      username: decodeSecret(raw.osUser),
      password: decodeSecret(raw.osPass)
    }
  } catch {
    secrets = {}
  }
  return secrets
}

async function saveSecrets(next: Secrets): Promise<void> {
  secrets = next
  token = null
  await mkdir(app.getPath('userData'), { recursive: true })
  await writeFile(
    secretsFile(),
    JSON.stringify({
      osApiKey: next.apiKey ? encodeSecret(next.apiKey) : undefined,
      osUser: next.username ? encodeSecret(next.username) : undefined,
      osPass: next.password ? encodeSecret(next.password) : undefined
    }),
    'utf-8'
  )
}

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err))

async function request(
  path: string,
  opts: { method?: string; body?: unknown; auth?: boolean } = {}
): Promise<{ status: number; data: Record<string, unknown> | null }> {
  const s = await loadSecrets()
  if (!s.apiKey) throw new Error('OpenSubtitles API anahtarı girilmemiş (Ayarlar)')
  const headers: Record<string, string> = {
    'Api-Key': s.apiKey,
    'User-Agent': USER_AGENT,
    Accept: 'application/json'
  }
  if (opts.body) headers['Content-Type'] = 'application/json'
  let base = API
  if (opts.auth) {
    const t = await login()
    headers.Authorization = `Bearer ${t.value}`
    base = t.base
  }
  const res = await fetch(`${base}${path}`, {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(15000)
  })
  let data: Record<string, unknown> | null = null
  try {
    data = JSON.parse(await res.text())
  } catch {
    data = null
  }
  return { status: res.status, data }
}

async function login(): Promise<{ value: string; at: number; base: string }> {
  if (token && Date.now() - token.at < 20 * 3600_000) return token
  const s = await loadSecrets()
  if (!s.username || !s.password) throw new Error('OpenSubtitles kullanıcı adı ve şifresi girilmemiş (Ayarlar)')
  const r = await request('/login', { method: 'POST', body: { username: s.username, password: s.password } })
  const value = r.data?.token as string | undefined
  if (r.status !== 200 || !value) {
    throw new Error(
      r.status === 401
        ? 'OpenSubtitles kullanıcı adı veya şifre hatalı'
        : (r.data?.message as string) || `OpenSubtitles girişi başarısız (${r.status})`
    )
  }
  const baseUrl = r.data?.base_url as string | undefined
  token = { value, at: Date.now(), base: baseUrl ? `https://${baseUrl}/api/v1` : API }
  return token
}

function toVtt(text: string): string {
  const t = text.replace(/^﻿/, '').replace(/\r/g, '')
  if (t.startsWith('WEBVTT')) return t
  return `WEBVTT\n\n${t.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')}`
}

let started = false

export function initSubtitles(): void {
  if (started) return
  started = true

  ipcMain.handle('subs:getConfig', async () => {
    const s = await loadSecrets()
    return { hasApiKey: !!s.apiKey, username: s.username || '', hasPassword: !!s.password }
  })

  ipcMain.handle(
    'subs:saveConfig',
    async (_e, patch: { apiKey?: string; username?: string; password?: string; clear?: boolean }) => {
      if (patch.clear) {
        await saveSecrets({})
        return true
      }
      const s = await loadSecrets()
      await saveSecrets({
        apiKey: patch.apiKey?.trim() || s.apiKey,
        username: patch.username?.trim() || s.username,
        password: patch.password || s.password
      })
      return true
    }
  )

  ipcMain.handle('subs:test', async () => {
    try {
      token = null
      await login()
      const r = await request('/infos/user', { auth: true })
      const info = (r.data?.data || {}) as { remaining_downloads?: number }
      return { ok: true, remaining: info.remaining_downloads }
    } catch (err) {
      return { ok: false, error: message(err) }
    }
  })

  ipcMain.handle('subs:search', async (_e, p: SubtitleSearchParams) => {
    try {
      const q = new URLSearchParams()
      if (p.imdbId) q.set('imdb_id', p.imdbId.replace(/^tt/, ''))
      if (p.parentImdbId) q.set('parent_imdb_id', p.parentImdbId.replace(/^tt/, ''))
      if (p.season !== undefined) q.set('season_number', String(p.season))
      if (p.episode !== undefined) q.set('episode_number', String(p.episode))
      if (p.query) q.set('query', p.query.toLowerCase())
      if (p.year) q.set('year', p.year)
      q.set('languages', p.languages || 'tr')
      q.set('order_by', 'download_count')
      // OpenSubtitles parametrelerin alfabetik sırada olmasını istiyor (yönlendirme olmasın)
      q.sort()
      const r = await request(`/subtitles?${q}`)
      if (r.status !== 200) {
        return { ok: false, error: (r.data?.message as string) || `Arama başarısız (${r.status})` }
      }
      const rows = (r.data?.data || []) as {
        attributes?: {
          release?: string
          language?: string
          download_count?: number
          hearing_impaired?: boolean
          machine_translated?: boolean
          ai_translated?: boolean
          files?: { file_id: number; file_name?: string }[]
        }
      }[]
      const items: SubtitleResult[] = rows
        .flatMap((d) => {
          const a = d.attributes || {}
          const f = a.files?.[0]
          if (!f) return []
          return [
            {
              fileId: f.file_id,
              release: a.release || f.file_name || 'Altyazı',
              language: a.language || '',
              downloads: a.download_count ?? 0,
              hearingImpaired: !!a.hearing_impaired,
              machine: !!a.machine_translated || !!a.ai_translated
            }
          ]
        })
        .slice(0, 30)
      return { ok: true, items }
    } catch (err) {
      return { ok: false, error: message(err) }
    }
  })

  ipcMain.handle('subs:download', async (_e, fileId: number) => {
    try {
      const r = await request('/download', { method: 'POST', body: { file_id: fileId, sub_format: 'webvtt' }, auth: true })
      const link = r.data?.link as string | undefined
      if (r.status !== 200 || !link) {
        return {
          ok: false,
          error:
            r.status === 406
              ? 'Bugünkü altyazı indirme hakkın doldu (ücretsiz hesapta günlük sınır var)'
              : (r.data?.message as string) || `Altyazı indirilemedi (${r.status})`
        }
      }
      const res = await fetch(link, { signal: AbortSignal.timeout(20000) })
      const buf = Buffer.from(await res.arrayBuffer())
      let text = new TextDecoder('utf-8').decode(buf)
      // Türkçe karakterler bozuk geldiyse eski Türkçe kodlamayla çöz
      if ((text.match(/�/g) || []).length > 5) text = new TextDecoder('windows-1254').decode(buf)
      return { ok: true, vtt: toVtt(text), remaining: r.data?.remaining as number | undefined }
    } catch (err) {
      return { ok: false, error: message(err) }
    }
  })
}
