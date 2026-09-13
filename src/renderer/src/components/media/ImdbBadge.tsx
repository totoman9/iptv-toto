import type { ReactElement } from 'react'
import type { ImdbState } from '../../hooks/useImdb'

// Film/dizi sayfasındaki IMDb puanı satırı
export function ImdbBadge({ state }: { state: ImdbState }): ReactElement | null {
  if (state.status === 'nokey') {
    return <div className="imdb-hint">IMDb puanı için Ayarlar'dan OMDb anahtarı ekle.</div>
  }
  if (state.status === 'loading') return <div className="imdb-hint">IMDb puanı alınıyor…</div>
  if (state.status === 'error') return <div className="imdb-hint">IMDb: {state.error || 'alınamadı'}</div>
  if (state.status === 'notfound') return <div className="imdb-hint">IMDb'de bulunamadı</div>
  const info = state.info
  if (!info) return null
  return (
    <div className="imdb-row">
      <a className="imdb-badge" href={info.url} target="_blank" rel="noreferrer" title="IMDb sayfasını aç">
        <span className="imdb-logo">IMDb</span>
        <b>{info.rating !== undefined ? info.rating.toFixed(1) : '–'}</b>
        {info.votes && <small>{info.votes} oy</small>}
      </a>
      {info.rottenTomatoes && (
        <span className="score-chip" title="Rotten Tomatoes">
          🍅 {info.rottenTomatoes}
        </span>
      )}
      {info.metascore && (
        <span className="score-chip" title="Metacritic">
          Metascore {info.metascore}
        </span>
      )}
    </div>
  )
}

export function episodeRatingClass(rating: number): string {
  if (rating >= 8.5) return 'ep-rating-great'
  if (rating >= 7.5) return 'ep-rating-good'
  if (rating >= 6.5) return 'ep-rating-ok'
  return 'ep-rating-low'
}
