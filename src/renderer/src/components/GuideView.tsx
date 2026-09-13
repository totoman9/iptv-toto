import { useEffect, useMemo, useState, type ReactElement } from 'react'
import type { EpgProgram } from '../../../shared/types'
import type { EpgIndexState } from '../hooks/useEpgIndex'
import type { Reminder } from '../lib/reminders'
import {
  currentProgram,
  isMatchProgram,
  isReplay,
  isSportsChannel,
  nextProgram,
  type IndexedChannel
} from '../lib/epgIndex'
import { fold } from '../lib/search'
import { IconBell, IconLiveTv, IconPlay, IconRecord, IconRefresh, IconSearch, IconTrash } from './Icons'

type Tab = 'now' | 'matches' | 'search' | 'reminders'
type NowFilter = 'all' | 'favorites' | 'sports' | 'main' | 'news'

interface Props {
  index: EpgIndexState
  favoriteIds: Set<string>
  isLocked: (group: string) => boolean
  reminders: Reminder[]
  isReminded: (channelId: string, start: number) => boolean
  onToggleReminder: (channel: IndexedChannel, program: EpgProgram) => void
  onRemoveReminder: (id: string) => void
  onWatch: (channelId: string) => void
  onRecord: (channel: IndexedChannel, program: EpgProgram) => Promise<string>
}

const pad = (n: number): string => String(n).padStart(2, '0')
const clock = (ms: number): string => {
  const d = new Date(ms)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function dayLabel(ms: number): string {
  const d = new Date(ms)
  const today = new Date()
  const startOf = (x: Date): number => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((startOf(d) - startOf(today)) / 86400000)
  if (diff === 0) return 'Bugün'
  if (diff === 1) return 'Yarın'
  return d.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(iv)
  }, [intervalMs])
  return now
}

interface ProgramRowProps {
  title: string
  program: EpgProgram
  channels: IndexedChannel[]
  now: number
  replay?: boolean
  reminded: boolean
  onWatch: (channelId: string) => void
  onToggleReminder: () => void
  onRecord: () => Promise<string>
}

function ProgramRow({
  title,
  program,
  channels,
  now,
  replay,
  reminded,
  onWatch,
  onToggleReminder,
  onRecord
}: ProgramRowProps): ReactElement {
  const [message, setMessage] = useState<string | null>(null)
  const live = program.start <= now && program.end > now
  return (
    <div className={`program-row ${live ? 'is-live' : ''}`}>
      <div className="program-time">
        {live ? <span className="program-live">CANLI</span> : clock(program.start)}
        <small>– {clock(program.end)}</small>
      </div>
      <div className="program-main">
        <div className="program-title">
          {title}
          {replay && <span className="program-tag">Tekrar</span>}
        </div>
        <div className="program-channels">
          {channels.map((ch) => (
            <button key={ch.channelId} className="program-channel" onClick={() => onWatch(ch.channelId)}>
              {ch.logo && <img src={ch.logo} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />}
              {ch.name}
            </button>
          ))}
        </div>
        {message && <div className="program-msg">{message}</div>}
      </div>
      <div className="program-actions">
        {live ? (
          <button className="btn-primary btn-sm" onClick={() => onWatch(channels[0].channelId)}>
            <IconPlay size={11} /> İzle
          </button>
        ) : (
          <>
            <button
              className={`btn-secondary btn-sm ${reminded ? 'is-reminded' : ''}`}
              onClick={onToggleReminder}
              title="Başlamadan 5 dakika önce haber ver"
            >
              <IconBell size={12} /> {reminded ? 'Hatırlatılacak' : 'Hatırlat'}
            </button>
            <button
              className="btn-secondary btn-sm"
              onClick={async () => {
                setMessage('Planlanıyor…')
                setMessage(await onRecord())
              }}
            >
              <IconRecord size={12} /> Kaydet
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export function GuideView({
  index,
  favoriteIds,
  isLocked,
  reminders,
  isReminded,
  onToggleReminder,
  onRemoveReminder,
  onWatch,
  onRecord
}: Props): ReactElement {
  const [tab, setTab] = useState<Tab>('now')
  const [nowFilter, setNowFilter] = useState<NowFilter>('all')
  const [query, setQuery] = useState('')
  const now = useNow(30_000)

  const channels = useMemo(() => index.channels.filter((c) => !isLocked(c.group)), [index.channels, isLocked])

  // ----- Şimdi yayında -----
  const nowCards = useMemo(() => {
    const list = channels
      .map((ch) => ({ ch, cur: currentProgram(ch, now), next: nextProgram(ch, now) }))
      .filter((x) => x.cur)
      .filter(({ ch }) => {
        if (nowFilter === 'favorites') return favoriteIds.has(ch.channelId)
        if (nowFilter === 'sports') return isSportsChannel(ch)
        if (nowFilter === 'main') return /ulusal/i.test(ch.group)
        if (nowFilter === 'news') return /haber|news/i.test(ch.group)
        return true
      })
    // Favoriler önde
    return [...list.filter((x) => favoriteIds.has(x.ch.channelId)), ...list.filter((x) => !favoriteIds.has(x.ch.channelId))]
  }, [channels, now, nowFilter, favoriteIds])

  // ----- Maç merkezi: aynı maç birden fazla kanalda olabilir, tek satırda topla -----
  const matchDays = useMemo(() => {
    const horizon = now + 48 * 3600_000
    const groups = new Map<string, { title: string; program: EpgProgram; channels: IndexedChannel[] }>()
    for (const ch of channels) {
      for (const p of ch.programs) {
        if (p.end <= now || p.start > horizon || !isMatchProgram(ch, p)) continue
        const key = `${fold(p.title)}@${p.start}`
        const g = groups.get(key)
        if (g) g.channels.push(ch)
        else groups.set(key, { title: p.title, program: p, channels: [ch] })
      }
    }
    const sorted = [...groups.values()].sort((a, b) => a.program.start - b.program.start)
    const days: { label: string; items: typeof sorted }[] = []
    for (const m of sorted) {
      const label = m.program.start <= now ? 'Şu an' : dayLabel(m.program.start)
      const day = days.find((d) => d.label === label)
      if (day) day.items.push(m)
      else days.push({ label, items: [m] })
    }
    return days
  }, [channels, now])

  // ----- Program ara -----
  const searchResults = useMemo(() => {
    const q = fold(query.trim())
    if (q.length < 2) return null
    const out: { ch: IndexedChannel; p: EpgProgram }[] = []
    for (const ch of channels) {
      for (const p of ch.programs) {
        if (p.end > now && fold(p.title).includes(q)) out.push({ ch, p })
      }
    }
    return out.sort((a, b) => a.p.start - b.p.start).slice(0, 150)
  }, [channels, query, now])

  const upcomingReminders = useMemo(() => [...reminders].sort((a, b) => a.start - b.start), [reminders])

  const row = (ch: IndexedChannel[], p: EpgProgram, title = p.title, key?: string): ReactElement => (
    <ProgramRow
      key={key ?? `${ch[0].channelId}-${p.start}`}
      title={title}
      program={p}
      channels={ch}
      now={now}
      replay={isReplay(p)}
      reminded={isReminded(ch[0].channelId, p.start)}
      onWatch={onWatch}
      onToggleReminder={() => onToggleReminder(ch[0], p)}
      onRecord={() => onRecord(ch[0], p)}
    />
  )

  const empty = channels.length === 0

  return (
    <div className="guide-view">
      <div className="media-toolbar">
        <div className="media-toolbar-title">Rehber</div>
        <div className="seg-toggle">
          <button className={tab === 'now' ? 'active' : ''} onClick={() => setTab('now')}>
            Şimdi yayında
          </button>
          <button className={tab === 'matches' ? 'active' : ''} onClick={() => setTab('matches')}>
            Maç merkezi
          </button>
          <button className={tab === 'search' ? 'active' : ''} onClick={() => setTab('search')}>
            Program ara
          </button>
          <button className={tab === 'reminders' ? 'active' : ''} onClick={() => setTab('reminders')}>
            Hatırlatıcılar{reminders.length > 0 ? ` (${reminders.length})` : ''}
          </button>
        </div>
        <div className="topbar-spacer" />
        <span className="guide-status">
          {index.error && !index.building
            ? index.error
            : index.building
            ? index.progress
              ? `Program bilgileri toplanıyor… ${index.progress.done}/${index.progress.total}`
              : 'Rehber hazırlanıyor…'
            : index.savedAt
              ? `${channels.length} kanal · güncellendi ${clock(index.savedAt)}`
              : ''}
        </span>
        <button
          className={`icon-btn ${index.building ? 'icon-btn-spinning' : ''}`}
          onClick={index.refresh}
          title="Rehberi şimdi tazele"
        >
          <IconRefresh size={14} />
        </button>
      </div>

      <div className="guide-body">
        {empty && tab !== 'reminders' ? (
          <div className="empty-state">
            {index.building ? (
              <>
                <div className="spinner" />
                <p>
                  Program bilgileri kanal kanal toplanıyor
                  {index.progress ? ` (${index.progress.done}/${index.progress.total})` : ''}… İlk seferde
                  yaklaşık bir dakika sürer, sonra hazır bekler.
                </p>
              </>
            ) : (
              <>
                <h3>Rehber bilgisi yok</h3>
                <p>Rehber yalnızca Xtream Codes kaynaklarında çalışır.</p>
              </>
            )}
          </div>
        ) : tab === 'now' ? (
          <>
            <div className="guide-filters">
              {(
                [
                  ['all', 'Tümü'],
                  ['favorites', 'Favoriler'],
                  ['sports', 'Spor'],
                  ['main', 'Ulusal'],
                  ['news', 'Haber']
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  className={`chip-btn ${nowFilter === value ? 'active' : ''}`}
                  onClick={() => setNowFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            {nowCards.length === 0 && <p className="guide-empty">Bu filtrede şu an yayında program bilgisi olan kanal yok.</p>}
            <div className="now-grid">
              {nowCards.map(({ ch, cur, next }) => {
                const ratio = cur ? Math.min(1, Math.max(0, (now - cur.start) / (cur.end - cur.start))) : 0
                return (
                  <button key={ch.channelId} className="now-card" onClick={() => onWatch(ch.channelId)}>
                    <div className="now-card-head">
                      <span className="now-card-logo">
                        {ch.logo ? (
                          <img src={ch.logo} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />
                        ) : (
                          <IconLiveTv size={14} />
                        )}
                      </span>
                      <span className="now-card-channel">{ch.name}</span>
                      {favoriteIds.has(ch.channelId) && <span className="now-card-fav">★</span>}
                    </div>
                    <div className="now-card-title">{cur!.title}</div>
                    <div className="now-card-bar">
                      <span style={{ width: `${ratio * 100}%` }} />
                    </div>
                    <div className="now-card-meta">
                      {clock(cur!.start)} – {clock(cur!.end)}
                      {next && (
                        <span className="now-card-next">
                          Sonra {clock(next.start)} · {next.title}
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </>
        ) : tab === 'matches' ? (
          matchDays.length === 0 ? (
            <div className="empty-state">
              <h3>Maç bulunamadı</h3>
              <p>
                Önümüzdeki 2 günde spor kanallarının rehberinde maç görünmüyor. Rehber toplanıyorsa birazdan
                tekrar bak.
              </p>
            </div>
          ) : (
            matchDays.map((day) => (
              <section key={day.label} className="guide-section">
                <div className="guide-section-title">{day.label}</div>
                {day.items.map((m) => row(m.channels, m.program, m.title, `${m.title}-${m.program.start}`))}
              </section>
            ))
          )
        ) : tab === 'search' ? (
          <>
            <div className="guide-search">
              <IconSearch size={15} />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Program, dizi ya da maç adı yaz (ör. Survivor, Galatasaray)…"
              />
            </div>
            {!searchResults ? (
              <p className="guide-empty">
                Önümüzdeki programlar içinde arar ({channels.length} kanalın rehberi toplandı).
              </p>
            ) : searchResults.length === 0 ? (
              <p className="guide-empty">“{query.trim()}” için yaklaşan program bulunamadı.</p>
            ) : (
              searchResults.map(({ ch, p }) => row([ch], p))
            )}
          </>
        ) : upcomingReminders.length === 0 ? (
          <div className="empty-state">
            <h3>Hatırlatıcı yok</h3>
            <p>
              Maç merkezinde, program aramasında ya da TV rehberinde bir programa “Hatırlat” de; başlamadan 5
              dakika önce haber vereyim. Uygulama açık olmalı.
            </p>
          </div>
        ) : (
          <section className="guide-section">
            {upcomingReminders.map((r) => (
              <div key={r.id} className="program-row">
                <div className="program-time">
                  {clock(r.start)}
                  <small>{dayLabel(r.start)}</small>
                </div>
                <div className="program-main">
                  <div className="program-title">{r.title}</div>
                  <div className="program-channels">
                    <button className="program-channel" onClick={() => onWatch(r.channelId)}>
                      {r.logo && <img src={r.logo} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />}
                      {r.channelName}
                    </button>
                  </div>
                </div>
                <div className="program-actions">
                  <button className="icon-btn" onClick={() => onRemoveReminder(r.id)} title="Hatırlatıcıyı sil">
                    <IconTrash size={13} />
                  </button>
                </div>
              </div>
            ))}
          </section>
        )}
      </div>
    </div>
  )
}
