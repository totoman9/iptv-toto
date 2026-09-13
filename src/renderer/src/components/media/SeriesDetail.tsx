import { useEffect, useMemo, useState, type ReactElement } from 'react'
import type {
  MediaDetails,
  SeriesEpisode,
  SeriesItem,
  SeriesSeason,
  SourceConfig
} from '../../../../shared/types'
import type { ContinueWatchingEntry } from '../../lib/storage'
import { getSeriesSeasons } from '../../lib/xtream'
import { isFinished, progressRatio } from '../../lib/continueWatching'
import { formatTime, minutesLeft } from '../../lib/format'
import { IconArrowLeft, IconBell, IconBookmark, IconCheck, IconPlay, IconPlayCircle } from '../Icons'
import { usePersisted } from '../../lib/persisted'
import {
  followStore,
  markSeriesSeen,
  toggleFollow,
  toggleWatchlist,
  watchlistStore,
  youtubeId
} from '../../lib/library'
import type { PosterCardData } from './PosterCard'
import { SimilarRow } from './SimilarRow'
import { useImdb } from '../../hooks/useImdb'
import { cleanTitle, seasonRatings, type ImdbEpisode } from '../../lib/omdb'
import { ImdbBadge, episodeRatingClass } from './ImdbBadge'

interface Props {
  item: SeriesItem
  source: SourceConfig | null
  entries: ContinueWatchingEntry[]
  onBack: () => void
  // all: dizinin tüm bölümleri (sıradaki bölüme otomatik geçiş için)
  onPlayEpisode: (ep: SeriesEpisode, fromStart: boolean, all: SeriesEpisode[], seriesImdbId?: string) => void
  similar?: PosterCardData[]
  onOpenSimilar?: (id: string) => void
}

export const episodeProgressId = (ep: SeriesEpisode): string => `episode-${ep.id}`

export function SeriesDetail({
  item,
  source,
  entries,
  onBack,
  onPlayEpisode,
  similar,
  onOpenSimilar
}: Props): ReactElement {
  const [seasons, setSeasons] = useState<SeriesSeason[]>([])
  const [details, setDetails] = useState<MediaDetails>({})
  const [loading, setLoading] = useState(true)
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null)

  useEffect(() => {
    if (!source || source.type !== 'xtream') {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    getSeriesSeasons(source, item.seriesId)
      .then((data) => {
        if (cancelled) return
        setSeasons(data.seasons)
        setDetails(data.details)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [item.seriesId, source])

  // Bu dizinin izleme kayıtları (en son izlenen başta)
  const mine = useMemo(
    () =>
      entries
        .filter((e) => e.kind === 'episode' && e.seriesId === item.seriesId)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [entries, item.seriesId]
  )
  const byEpisode = useMemo(() => new Map(mine.map((e) => [e.id, e])), [mine])
  const allEpisodes = useMemo(() => seasons.flatMap((s) => s.episodes), [seasons])

  // "Devam et" hedefi: yarım kalan son bölüm; bitmişse bir sonraki bölüm
  const target = useMemo(() => {
    const latest = mine[0]
    if (latest) {
      const idx = allEpisodes.findIndex((ep) => episodeProgressId(ep) === latest.id)
      if (idx >= 0) {
        if (!isFinished(latest)) return { ep: allEpisodes[idx], mode: 'resume' as const, entry: latest }
        if (allEpisodes[idx + 1]) return { ep: allEpisodes[idx + 1], mode: 'next' as const }
      }
    }
    return allEpisodes[0] ? { ep: allEpisodes[0], mode: 'start' as const } : null
  }, [mine, allEpisodes])

  useEffect(() => {
    if (seasons.length && selectedSeason === null) {
      setSelectedSeason(target?.ep.season ?? seasons[0].season)
    }
  }, [seasons, target, selectedSeason])

  const season = seasons.find((s) => s.season === selectedSeason) || seasons[0]

  // IMDb: dizinin puanı ve seçili sezonun bölüm puanları
  const imdb = useImdb([item.name], (details.releaseDate || item.year)?.slice(0, 4), 'series', !loading)
  const [episodeRatings, setEpisodeRatings] = useState<Map<number, ImdbEpisode>>(new Map())
  useEffect(() => {
    setEpisodeRatings(new Map())
    const imdbId = imdb.info?.imdbId
    if (!imdbId || !season) return
    let cancelled = false
    seasonRatings(imdbId, season.season, season.episodes.length)
      .then((list) => {
        if (!cancelled) setEpisodeRatings(new Map(list.map((e) => [e.episode, e])))
      })
      .catch(() => {
        /* bölüm puanları alınamadı; liste puansız görünür */
      })
    return () => {
      cancelled = true
    }
  }, [imdb.info?.imdbId, season?.season, season?.episodes.length])
  const poster = details.coverBig || item.logo
  const bg = item.backdrop || poster
  const inList = usePersisted(watchlistStore).some((w) => w.id === item.id)
  const following = usePersisted(followStore).find((f) => f.seriesId === item.seriesId)

  // Takip edilen dizinin sayfası açıldı: yeni bölümler görülmüş sayılır
  useEffect(() => {
    if (following && allEpisodes.length > 0) markSeriesSeen(item.seriesId, allEpisodes.length)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allEpisodes.length, !!following])

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
              {(details.releaseDate || item.year) && (
                <span>{(details.releaseDate || item.year || '').slice(0, 4)}</span>
              )}
              {(details.genre || item.genre) && <span>{details.genre || item.genre}</span>}
              {seasons.length > 0 && <span>{seasons.length} sezon</span>}
              {(details.rating || item.rating) && <span>★ {details.rating || item.rating}</span>}
            </div>
            <ImdbBadge state={imdb} />
            {loading ? (
              <p className="detail-plot">Bölümler yükleniyor…</p>
            ) : (
              details.plot && <p className="detail-plot">{details.plot}</p>
            )}
            {details.cast && (
              <p className="detail-credits">
                <b>Oyuncular:</b> {details.cast}
              </p>
            )}

            <div className="detail-actions">
              {target && (
                <button className="btn-light" onClick={() => onPlayEpisode(target.ep, false, allEpisodes, imdb.info?.imdbId)}>
                  <IconPlay size={14} />
                  {target.mode === 'resume'
                    ? ` Devam et · S${target.ep.season} B${target.ep.episodeNum}`
                    : target.mode === 'next'
                      ? ` Sonraki bölüm · S${target.ep.season} B${target.ep.episodeNum}`
                      : ' İzlemeye başla'}
                </button>
              )}
              <button
                className={`btn-glass ${following ? 'is-on' : ''}`}
                onClick={() => toggleFollow(item, allEpisodes.length)}
                title={following ? 'Takibi bırak' : 'Yeni bölüm eklenince haber ver'}
              >
                <IconBell size={14} /> {following ? 'Takiptesin' : 'Takip et'}
              </button>
              <button
                className="btn-glass"
                onClick={() =>
                  toggleWatchlist({ id: item.id, kind: 'series', name: item.name, logo: item.logo, group: item.group })
                }
                title={inList ? 'İzleme listenden çıkar' : 'Sonra izlemek için listene ekle'}
              >
                {inList ? <IconCheck size={14} /> : <IconBookmark size={14} />} {inList ? 'Listemde' : 'Listeme ekle'}
              </button>
              <button
                className="btn-glass"
                onClick={() => {
                  const id = youtubeId(details.trailer)
                  void window.iptv.media.openTrailer(id ? { id } : { query: `${cleanTitle(item.name).title} dizi fragman` })
                }}
                title={youtubeId(details.trailer) ? 'Fragmanı izle' : "Fragmanı YouTube'da ara"}
              >
                <IconPlayCircle size={14} /> Fragman
              </button>
            </div>
            {target?.mode === 'resume' && target.entry && (
              <div className="detail-progress-wrap">
                <div className="detail-progress">
                  <div style={{ width: `${progressRatio(target.entry) * 100}%` }} />
                </div>
                <span>
                  {formatTime(target.entry.positionSeconds)} ·{' '}
                  {minutesLeft(target.entry.positionSeconds, target.entry.durationSeconds)} dk kaldı
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="detail-body">
        {seasons.length > 1 && (
          <div className="season-tabs">
            {seasons.map((s) => (
              <button
                key={s.season}
                className={`chip-btn ${season?.season === s.season ? 'active' : ''}`}
                onClick={() => setSelectedSeason(s.season)}
              >
                {s.season}. Sezon
              </button>
            ))}
          </div>
        )}

        {!loading && seasons.length === 0 && (
          <p className="detail-empty">Bu dizi için bölüm bulunamadı.</p>
        )}

        <div className="episode-list">
          {season?.episodes.map((ep) => {
            const entry = byEpisode.get(episodeProgressId(ep))
            const finished = entry ? isFinished(entry) : false
            const ratio = progressRatio(entry)
            const rating = episodeRatings.get(ep.episodeNum)?.rating
            return (
              <button key={ep.id} className="episode-item" onClick={() => onPlayEpisode(ep, false, allEpisodes, imdb.info?.imdbId)}>
                <span className="episode-num">{ep.episodeNum}</span>
                {rating !== undefined && (
                  <span className={`ep-rating ${episodeRatingClass(rating)}`} title="Bölümün IMDb puanı">
                    ★ {rating.toFixed(1)}
                  </span>
                )}
                <span className="episode-main">
                  <span className="episode-title">{ep.title}</span>
                  <span className="episode-sub">
                    {finished ? (
                      <span className="episode-watched">
                        <IconCheck size={12} /> İzlendi
                      </span>
                    ) : entry ? (
                      `${formatTime(entry.positionSeconds)} izlendi · ${minutesLeft(entry.positionSeconds, entry.durationSeconds)} dk kaldı`
                    ) : (
                      `${ep.season}. sezon, ${ep.episodeNum}. bölüm`
                    )}
                  </span>
                  {entry && !finished && (
                    <span className="episode-bar">
                      <span style={{ width: `${ratio * 100}%` }} />
                    </span>
                  )}
                </span>
                <IconPlay size={15} />
              </button>
            )
          })}
        </div>
        {similar && similar.length > 0 && onOpenSimilar && (
          <SimilarRow title="Benzer diziler" cards={similar} onOpen={onOpenSimilar} />
        )}
      </div>
    </div>
  )
}
