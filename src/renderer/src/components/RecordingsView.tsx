import type { ReactElement, ReactNode } from 'react'
import type { RecordingEntry } from '../../../shared/types'
import { IconFolder, IconLiveTv, IconPlay, IconStop, IconTrash } from './Icons'

interface Props {
  entries: RecordingEntry[]
  onPlay: (entry: RecordingEntry) => void
  onStop: (id: string) => void
  onRemove: (entry: RecordingEntry, deleteFile: boolean) => void
  onOpenFolder: () => void
  onShowFile: (path: string) => void
}

const pad = (n: number): string => String(n).padStart(2, '0')

function formatClock(ms: number): string {
  const d = new Date(ms)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatDate(ms: number): string {
  const d = new Date(ms)
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${formatClock(ms)}`
}

function formatSize(bytes?: number): string {
  if (!bytes) return ''
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1e6))} MB`
}

function formatDuration(ms: number): string {
  const m = Math.max(1, Math.round(ms / 60000))
  return m >= 60 ? `${Math.floor(m / 60)} sa ${m % 60} dk` : `${m} dk`
}

function Row({
  entry,
  meta,
  actions,
  live
}: {
  entry: RecordingEntry
  meta: string
  actions: ReactNode
  live?: boolean
}): ReactElement {
  return (
    <div className={`recording-row ${live ? 'is-live' : ''}`}>
      <div className="recording-logo">
        {entry.logo ? (
          <img src={entry.logo} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />
        ) : (
          <IconLiveTv size={16} />
        )}
      </div>
      <div className="recording-main">
        <div className="recording-title">
          {live && <span className="rec-dot" />}
          {entry.title}
        </div>
        <div className="recording-meta">{meta}</div>
      </div>
      <div className="recording-actions">{actions}</div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }): ReactElement {
  return (
    <section className="recording-section">
      <div className="recording-section-title">{title}</div>
      {children}
    </section>
  )
}

export function RecordingsView({
  entries,
  onPlay,
  onStop,
  onRemove,
  onOpenFolder,
  onShowFile
}: Props): ReactElement {
  const recording = entries.filter((e) => e.status === 'recording')
  const scheduled = entries.filter((e) => e.status === 'scheduled').sort((a, b) => a.start - b.start)
  const done = entries.filter((e) => e.status === 'done')
  const other = entries.filter((e) => e.status === 'failed' || e.status === 'cancelled')

  return (
    <div className="recordings-view">
      <div className="media-toolbar">
        <div className="media-toolbar-title">Kayıtlar</div>
        <div className="topbar-spacer" />
        <button className="btn-secondary btn-sm" onClick={onOpenFolder}>
          <IconFolder size={13} /> Klasörü aç
        </button>
      </div>

      <div className="recordings-scroll">
        {entries.length === 0 && (
          <div className="empty-state">
            <h3>Henüz kayıt yok</h3>
            <p>
              Canlı yayında “Kaydet” düğmesiyle izlediğin programı kaydedebilir, TV rehberinde ileri
              saatteki bir programa tıklayıp kaydını planlayabilirsin.
            </p>
          </div>
        )}

        {recording.length > 0 && (
          <Section title="Şu an kaydediliyor">
            {recording.map((e) => (
              <Row
                key={e.id}
                entry={e}
                live
                meta={`${e.channelName} · ${formatClock(e.start)} – ${formatClock(e.end)}${e.sizeBytes ? ` · ${formatSize(e.sizeBytes)}` : ''}`}
                actions={
                  <button className="btn-danger btn-sm" onClick={() => onStop(e.id)}>
                    <IconStop size={11} /> Durdur
                  </button>
                }
              />
            ))}
          </Section>
        )}

        {scheduled.length > 0 && (
          <Section title="Planlanan">
            {scheduled.map((e) => (
              <Row
                key={e.id}
                entry={e}
                meta={`${e.channelName} · ${formatDate(e.start)} – ${formatClock(e.end)} · ${formatDuration(e.end - e.start)}`}
                actions={
                  <button className="btn-secondary btn-sm" onClick={() => onStop(e.id)}>
                    İptal et
                  </button>
                }
              />
            ))}
          </Section>
        )}

        {done.length > 0 && (
          <Section title="Tamamlanan">
            {done.map((e) => (
              <Row
                key={e.id}
                entry={e}
                meta={
                  e.path
                    ? `${e.channelName} · ${formatDate(e.start)} · ${formatDuration(e.end - e.start)}${e.sizeBytes ? ` · ${formatSize(e.sizeBytes)}` : ''}`
                    : 'Dosya hazırlanıyor…'
                }
                actions={
                  <>
                    <button className="btn-primary btn-sm" disabled={!e.path} onClick={() => onPlay(e)}>
                      <IconPlay size={11} /> Oynat
                    </button>
                    <button
                      className="icon-btn"
                      disabled={!e.path}
                      onClick={() => e.path && onShowFile(e.path)}
                      title="Klasörde göster"
                    >
                      <IconFolder size={13} />
                    </button>
                    <button
                      className="icon-btn"
                      onClick={() => {
                        if (confirm(`“${e.title}” kaydı ve dosyası silinsin mi?`)) onRemove(e, true)
                      }}
                      title="Kaydı sil"
                    >
                      <IconTrash size={13} />
                    </button>
                  </>
                }
              />
            ))}
          </Section>
        )}

        {other.length > 0 && (
          <Section title="İptal edilen / başarısız">
            {other.map((e) => (
              <Row
                key={e.id}
                entry={e}
                meta={`${e.channelName} · ${formatDate(e.start)} · ${e.status === 'cancelled' ? 'İptal edildi' : e.error || 'Kaydedilemedi'}`}
                actions={
                  <button className="btn-secondary btn-sm" onClick={() => onRemove(e, false)}>
                    Listeden kaldır
                  </button>
                }
              />
            ))}
          </Section>
        )}

        <p className="recordings-note">
          Planlanan kayıtlar için uygulamanın o saatte açık olması gerekir. Hesabın aynı anda tek
          bağlantıya izin verdiği için kayıt sürerken yalnızca kaydedilen kanal izlenebilir.
        </p>
      </div>
    </div>
  )
}
