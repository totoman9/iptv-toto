import { useMemo, useState, type ReactElement } from 'react'
import { Sidebar, type ViewKey } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { ContentGrid } from './components/ContentGrid'
import { SeriesView } from './components/SeriesView'
import { AddSourceModal } from './components/AddSourceModal'
import { PlayerOverlay, type PlayableItem } from './components/PlayerOverlay'
import { useSources } from './hooks/useSources'
import { useLibrary } from './hooks/useLibrary'
import { useFavorites } from './hooks/useFavorites'
import type { Channel, VodItem } from '../../shared/types'
import { getVodStreamUrl } from './lib/xtream'

const VIEW_TITLES: Record<ViewKey, string> = {
  live: 'Canlı TV',
  vod: 'Filmler',
  series: 'Diziler',
  favorites: 'Favoriler'
}

function App(): ReactElement {
  const { sources, activeSource, activeSourceId, ready, addSource, setActiveSourceId } =
    useSources()
  const { channels, vod, series, loading, error, reload } = useLibrary(activeSource)
  const { favoriteIds, toggleFavorite } = useFavorites()

  const [view, setView] = useState<ViewKey>('live')
  const [search, setSearch] = useState('')
  const [showAddSource, setShowAddSource] = useState(false)
  const [playing, setPlaying] = useState<PlayableItem | null>(null)

  const favoriteChannels = useMemo(
    () => channels.filter((c) => favoriteIds.has(c.id)),
    [channels, favoriteIds]
  )

  function playChannel(channel: Channel): void {
    setPlaying({
      id: channel.id,
      name: channel.name,
      group: channel.group,
      url: channel.url,
      streamId: channel.streamId,
      isLive: true
    })
  }

  function playVod(item: VodItem): void {
    if (!activeSource || activeSource.type !== 'xtream') return
    setPlaying({
      id: item.id,
      name: item.name,
      group: item.group,
      url: getVodStreamUrl(activeSource, item),
      isLive: false
    })
  }

  function playEpisode(title: string, group: string, url: string): void {
    setPlaying({ id: url, name: title, group, url, isLive: false })
  }

  if (!ready) {
    return (
      <div className="app-shell">
        <div className="empty-state" style={{ gridColumn: '1 / -1' }}>
          <div className="spinner" />
        </div>
      </div>
    )
  }

  const noSourceYet = sources.length === 0

  return (
    <div className="app-shell">
      <Sidebar
        view={view}
        onViewChange={setView}
        sources={sources}
        activeSourceId={activeSourceId}
        onSourceChange={setActiveSourceId}
        onAddSource={() => setShowAddSource(true)}
      />

      <div className="main">
        <TopBar
          title={VIEW_TITLES[view]}
          search={search}
          onSearchChange={setSearch}
          onReload={reload}
          loading={loading}
        />

        <div className="content-scroll">
          {noSourceYet ? (
            <div className="empty-state">
              <h3>Henüz bir kaynak eklemedin</h3>
              <p>Başlamak için bir M3U linki ya da Xtream Codes hesabı ekle.</p>
              <button className="btn-primary" onClick={() => setShowAddSource(true)}>
                + Kaynak Ekle
              </button>
            </div>
          ) : loading ? (
            <div className="empty-state">
              <div className="spinner" />
              <p>İçerik yükleniyor…</p>
            </div>
          ) : error ? (
            <div className="empty-state">
              <h3>Bir sorun oluştu</h3>
              <p>{error}</p>
              <button className="btn-primary" onClick={reload}>
                Tekrar Dene
              </button>
            </div>
          ) : view === 'live' ? (
            <ContentGrid
              items={channels}
              search={search}
              onSelect={(item) => playChannel(item as Channel)}
              favoriteIds={favoriteIds}
              onToggleFavorite={toggleFavorite}
              emptyTitle="Canlı kanal bulunamadı"
              emptyHint="Bu kaynakta canlı yayın listesi yok."
            />
          ) : view === 'vod' ? (
            <ContentGrid
              items={vod}
              search={search}
              onSelect={(item) => playVod(item as VodItem)}
              emptyTitle="Film bulunamadı"
              emptyHint="Filmler yalnızca Xtream Codes kaynaklarında listelenir."
            />
          ) : view === 'series' ? (
            <SeriesView
              series={series}
              search={search}
              source={activeSource}
              onPlayEpisode={playEpisode}
            />
          ) : (
            <ContentGrid
              items={favoriteChannels}
              search={search}
              onSelect={(item) => playChannel(item as Channel)}
              favoriteIds={favoriteIds}
              onToggleFavorite={toggleFavorite}
              emptyTitle="Favori kanalın yok"
              emptyHint="Canlı TV listesinde kanalların üzerindeki yıldıza tıklayarak favorilere ekleyebilirsin."
            />
          )}
        </div>
      </div>

      {showAddSource && (
        <AddSourceModal
          onClose={() => setShowAddSource(false)}
          onAdd={(source) => {
            addSource(source)
            setShowAddSource(false)
          }}
        />
      )}

      {playing && (
        <PlayerOverlay item={playing} source={activeSource} onClose={() => setPlaying(null)} />
      )}
    </div>
  )
}

export default App
