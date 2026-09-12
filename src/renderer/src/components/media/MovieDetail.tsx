import { useEffect, useState, type ReactElement } from 'react'
import type { MediaDetails, SourceConfig, VodItem } from '../../../../shared/types'
import type { ContinueWatchingEntry } from '../../lib/storage'
import { getVodDetails } from '../../lib/xtream'
import { isFinished, progressRatio } from '../../lib/continueWatching'
import { formatTime, minutesLeft } from '../../lib/format'
import { IconArrowLeft, IconPlay } from '../Icons'

interface Props {
  item: VodItem
  source: SourceConfig | null
  progress?: ContinueWatchingEntry
  onBack: () => void
  onPlay: (fromStart: boolean) => void
}

export function MovieDetail({ item, source, progress, onBack, onPlay }: Props): ReactElement {
  const [details, setDetails] = useState<MediaDetails>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!source || source.type !== 'xtream') {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    getVodDetails(source, item.streamId)
      .then((d) => {
        if (!cancelled) setDetails(d)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [item.streamId, source])

  const resumable = !!progress && !isFinished(progress) && progress.positionSeconds > 5
  const poster = details.coverBig || item.logo
  const bg = details.backdrop || poster

  return (
    <div className="detail-page">
      <div className="detail-hero">
        {bg && <div className="detail-hero-bg" style={{ backgroundImage: `url("${bg}")` }} />}
        <div className="detail-hero-shade" />
        <button className="icon-btn detail-back" onClick={onBack} title="Geri">
          <IconArrowLeft size={16} />
        </button>
        <div className="detail-hero-content">
          <div className="detail-poster">
            {poster ? <img src={poster} alt="" /> : <span>{item.name.slice(0, 2)}</span>}
          </div>
          <div className="detail-info">
            <div className="detail-kicker">{item.group}</div>
            <h1 className="detail-title">{item.name}</h1>
            <div className="detail-meta">
              {details.releaseDate && <span>{details.releaseDate.slice(0, 4)}</span>}
              {details.genre && <span>{details.genre}</span>}
              {details.durationText && <span>{details.durationText}</span>}
              {(details.rating || item.rating) && <span>★ {details.rating || item.rating}</span>}
            </div>
            {loading ? (
              <p className="detail-plot">Bilgiler yükleniyor…</p>
            ) : (
              details.plot && <p className="detail-plot">{details.plot}</p>
            )}
            {details.cast && (
              <p className="detail-credits">
                <b>Oyuncular:</b> {details.cast}
              </p>
            )}
            {details.director && (
              <p className="detail-credits">
                <b>Yönetmen:</b> {details.director}
              </p>
            )}

            <div className="detail-actions">
              {resumable ? (
                <>
                  <button className="btn-light" onClick={() => onPlay(false)}>
                    <IconPlay size={14} /> Devam et ({formatTime(progress!.positionSeconds)})
                  </button>
                  <button className="btn-glass" onClick={() => onPlay(true)}>
                    Baştan başla
                  </button>
                </>
              ) : (
                <button className="btn-light" onClick={() => onPlay(true)}>
                  <IconPlay size={14} /> Oynat
                </button>
              )}
            </div>

            {resumable && (
              <div className="detail-progress-wrap">
                <div className="detail-progress">
                  <div style={{ width: `${progressRatio(progress) * 100}%` }} />
                </div>
                <span>
                  {minutesLeft(progress!.positionSeconds, progress!.durationSeconds)} dk kaldı
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
