import { useEffect, useState, type ReactElement } from 'react'
import type { MediaDetails, SourceConfig, VodItem } from '../../../shared/types'
import { getVodDetails } from '../lib/xtream'
import { IconPlay } from './Icons'

interface Props {
  item: VodItem
  source: SourceConfig | null
  onClose: () => void
  onPlay: (item: VodItem) => void
}

export function VodDetailModal({ item, source, onClose, onPlay }: Props): ReactElement {
  const [details, setDetails] = useState<MediaDetails>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!source || source.type !== 'xtream') {
      setLoading(false)
      return
    }
    let cancelled = false
    getVodDetails(source, item.streamId).then((data) => {
      if (!cancelled) {
        setDetails(data)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [item.streamId, source])

  const cover = details.coverBig || item.logo

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-vod" onClick={(e) => e.stopPropagation()}>
        <div className="vod-detail-layout">
          <div className="vod-detail-cover">
            {cover ? (
              <img src={cover} alt="" />
            ) : (
              <div className="vod-detail-cover-fallback">{item.name.slice(0, 2).toUpperCase()}</div>
            )}
          </div>
          <div className="vod-detail-info">
            <h2>{item.name}</h2>
            {loading ? (
              <p className="modal-sub">Bilgiler yükleniyor…</p>
            ) : (
              <>
                <div className="media-details-meta">
                  {details.releaseDate && <span>{details.releaseDate.slice(0, 4)}</span>}
                  {details.genre && <span>{details.genre}</span>}
                  {details.durationText && <span>{details.durationText}</span>}
                  {details.rating && <span>★ {details.rating}</span>}
                </div>
                {details.plot && <p className="media-details-plot">{details.plot}</p>}
                {details.cast && (
                  <p className="media-details-cast">
                    <b>Oyuncular:</b> {details.cast}
                  </p>
                )}
                {details.director && (
                  <p className="media-details-cast">
                    <b>Yönetmen:</b> {details.director}
                  </p>
                )}
              </>
            )}

            <div className="modal-actions" style={{ marginTop: 'auto' }}>
              <button className="btn-secondary" onClick={onClose}>
                Kapat
              </button>
              <button className="btn-primary" onClick={() => onPlay(item)}>
                <IconPlay size={13} /> Oynat
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
