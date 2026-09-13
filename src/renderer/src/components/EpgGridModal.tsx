import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import type { EpgProgram, SourceConfig } from '../../../shared/types'
import { getEpgGrid, type EpgGridChannel } from '../lib/xtream'
import { IconClose, IconLiveTv, IconRecord } from './Icons'

const PX_PER_MIN = 3.2
const WINDOW_BEFORE_MIN = 15
const WINDOW_AFTER_MIN = 240
const ROW_HEIGHT = 56

interface Props {
  source: SourceConfig
  channels: { streamId: number; name: string; logo?: string; id: string; group: string }[]
  categoryLabel: string
  truncated: boolean
  onClose: () => void
  onTuneChannel: (channelId: string) => void
  // İleri saatteki programı kaydet; sonuç mesajını döner
  onRecordProgram?: (streamId: number, program: EpgProgram) => Promise<string>
}

function formatHour(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function EpgGridModal({
  source,
  channels,
  categoryLabel,
  truncated,
  onClose,
  onTuneChannel,
  onRecordProgram
}: Props): ReactElement {
  const [rows, setRows] = useState<EpgGridChannel[] | null>(null)
  const [selected, setSelected] = useState<{ streamId: number; channel: string; program: EpgProgram } | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [progress, setProgress] = useState({ done: 0, total: channels.length })
  const scrollRef = useRef<HTMLDivElement>(null)
  const windowStart = useMemo(() => Date.now() - WINDOW_BEFORE_MIN * 60000, [])
  const windowEnd = windowStart + (WINDOW_BEFORE_MIN + WINDOW_AFTER_MIN) * 60000
  const totalWidth = (WINDOW_BEFORE_MIN + WINDOW_AFTER_MIN) * PX_PER_MIN

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let cancelled = false
    if (source.type !== 'xtream') return
    getEpgGrid(source, channels, (done, total) => {
      if (!cancelled) setProgress({ done, total })
    }).then((data) => {
      if (!cancelled) setRows(data)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // Açılışta "şimdi" çizgisine yakın bir yere kaydır
    if (scrollRef.current) {
      const nowX = ((Date.now() - windowStart) / 60000) * PX_PER_MIN
      scrollRef.current.scrollLeft = Math.max(0, nowX - 200)
    }
  }, [rows, windowStart])

  const hourMarks = useMemo(() => {
    const marks: { label: string; x: number }[] = []
    const first = new Date(windowStart)
    first.setMinutes(0, 0, 0)
    let t = first.getTime()
    if (t < windowStart) t += 60 * 60000
    while (t < windowEnd) {
      marks.push({ label: formatHour(new Date(t)), x: ((t - windowStart) / 60000) * PX_PER_MIN })
      t += 60 * 60000
    }
    return marks
  }, [windowStart, windowEnd])

  const nowX = ((Date.now() - windowStart) / 60000) * PX_PER_MIN

  return (
    <div className="epg-overlay">
      <div className="epg-overlay-header">
        <div>
          <h2>TV Rehberi</h2>
          <p className="modal-sub">{categoryLabel}</p>
        </div>
        <div className="topbar-spacer" />
        <button className="icon-btn" onClick={onClose} title="Kapat (Esc)">
          <IconClose size={16} />
        </button>
      </div>

      {truncated && (
        <div className="epg-truncated-notice">
          Çok fazla kanal var, ilk {channels.length} kanal gösteriliyor. Daha iyi sonuç için soldan
          bir kategori seç.
        </div>
      )}

      {rows === null ? (
        <div className="empty-state">
          <div className="spinner" />
          <p>
            Program bilgileri yükleniyor… ({progress.done}/{progress.total})
          </p>
        </div>
      ) : (
        <div className="epg-grid-body">
          <div className="epg-channel-col">
            <div className="epg-channel-col-spacer" />
            {rows.map((row) => (
              <div className="epg-channel-cell" key={row.streamId} style={{ height: ROW_HEIGHT }}>
                <div className="epg-channel-logo">
                  {row.logo ? (
                    <img src={row.logo} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />
                  ) : (
                    <IconLiveTv size={14} />
                  )}
                </div>
                <span>{row.name}</span>
              </div>
            ))}
          </div>

          <div className="epg-timeline-scroll" ref={scrollRef}>
            <div className="epg-timeline-inner" style={{ width: totalWidth }}>
              <div className="epg-hour-ruler">
                {hourMarks.map((m) => (
                  <div key={m.x} className="epg-hour-mark" style={{ left: m.x }}>
                    {m.label}
                  </div>
                ))}
              </div>

              <div className="epg-now-line" style={{ left: nowX }} />

              {rows.map((row) => (
                <div className="epg-timeline-row" key={row.streamId} style={{ height: ROW_HEIGHT }}>
                  {row.programs.length === 0 && (
                    <div className="epg-no-data">Program bilgisi yok</div>
                  )}
                  {row.programs.map((p, i) => {
                    if (p.end <= windowStart || p.start >= windowEnd) return null
                    const left = Math.max(0, ((p.start - windowStart) / 60000) * PX_PER_MIN)
                    const right = Math.min(totalWidth, ((p.end - windowStart) / 60000) * PX_PER_MIN)
                    const isNow = p.start <= Date.now() && p.end > Date.now()
                    return (
                      <button
                        key={i}
                        className={`epg-program-block ${isNow ? 'now' : ''}`}
                        style={{ left, width: Math.max(4, right - left) }}
                        title={`${p.title}\n${formatHour(new Date(p.start))}–${formatHour(new Date(p.end))}`}
                        onClick={() => {
                          if (isNow) onTuneChannel(channelIdFor(row.streamId, channels))
                          else if (p.start > Date.now() && onRecordProgram) {
                            setSelected({ streamId: row.streamId, channel: row.name, program: p })
                            setActionMessage(null)
                          }
                        }}
                      >
                        {p.title}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {selected && (
        <div
          className="epg-action-backdrop"
          onClick={() => {
            setSelected(null)
            setActionMessage(null)
          }}
        >
          <div className="epg-action-card" onClick={(e) => e.stopPropagation()}>
            <div className="epg-action-time">
              {selected.channel} · {formatHour(new Date(selected.program.start))}–
              {formatHour(new Date(selected.program.end))}
            </div>
            <div className="epg-action-title">{selected.program.title}</div>
            {selected.program.description && (
              <p className="epg-action-desc">{selected.program.description}</p>
            )}
            {actionMessage && <p className="epg-action-msg">{actionMessage}</p>}
            <div className="modal-actions">
              <button
                className="btn-secondary"
                onClick={() => {
                  setSelected(null)
                  setActionMessage(null)
                }}
              >
                Kapat
              </button>
              {!actionMessage && onRecordProgram && (
                <button
                  className="btn-primary"
                  onClick={async () => {
                    setActionMessage('Planlanıyor…')
                    setActionMessage(await onRecordProgram(selected.streamId, selected.program))
                  }}
                >
                  <IconRecord size={13} /> Kaydet
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function channelIdFor(
  streamId: number,
  channels: { streamId: number; id: string }[]
): string {
  return channels.find((c) => c.streamId === streamId)?.id || ''
}
