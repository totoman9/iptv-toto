import { useMemo, useState, type ReactElement } from 'react'
import { TopNav, type ViewKey } from './components/TopNav'
import { CategoryColumn, ALL_GROUP } from './components/CategoryColumn'
import { ItemListColumn, type ListableItem } from './components/ItemListColumn'
import { SeriesView } from './components/SeriesView'
import { AddSourceModal } from './components/AddSourceModal'
import { PlayerPane, type PlayableItem } from './components/PlayerPane'
import { useSources } from './hooks/useSources'
import { useLibrary } from './hooks/useLibrary'
import { useFavorites } from './hooks/useFavorites'
import type { Channel, VodItem } from '../../shared/types'
import { getVodStreamUrl } from './lib/xtream'

function App(): ReactElement {
  const { sources, activeSource, activeSourceId, ready, addSource, setActiveSourceId } =
    useSources()
  const { channels, vod, series, liveCategoryOrder, vodCategoryOrder, loading, error, reload } =
    useLibrary(activeSource)
  const { favoriteIds, toggleFavorite } = useFavorites()

  const [view, setView] = useState<ViewKey>('live')
  const [showAddSource, setShowAddSource] = useState(false)
  const [playing, setPlaying] = useState<PlayableItem | null>(null)
  const [liveGroup, setLiveGroup] = useState(ALL_GROUP)
  const [vodGroup, setVodGroup] = useState(ALL_GROUP)

  const favoriteChannels = useMemo(
    () => channels.filter((c) => favoriteIds.has(c.id)),
    [channels, favoriteIds]
  )

  function playChannel(item: ListableItem): void {
    const channel = item as Channel
    setPlaying({
      id: channel.id,
      name: channel.name,
      group: channel.group,
      url: channel.url,
      streamId: channel.streamId,
      isLive: true
    })
  }

  function playVod(item: ListableItem): void {
    if (!activeSource || activeSource.type !== 'xtream') return
    const vodItem = item as VodItem
    setPlaying({
      id: vodItem.id,
      name: vodItem.name,
      group: vodItem.group,
      url: getVodStreamUrl(activeSource, vodItem),
      isLive: false
    })
  }

  function playEpisode(title: string, group: string, url: string): void {
    setPlaying({ id: url, name: title, group, url, isLive: false })
  }

  if (!ready) {
    return (
      <div className="app-shell app-shell-loading">
        <div className="empty-state">
          <div className="spinner" />
        </div>
      </div>
    )
  }

  const noSourceYet = sources.length === 0

  return (
    <div className="app-shell">
      <TopNav
        view={view}
        onViewChange={setView}
        sources={sources}
        activeSourceId={activeSourceId}
        onSourceChange={setActiveSourceId}
        onAddSource={() => setShowAddSource(true)}
        onReload={reload}
        loading={loading}
      />

      <div className="app-body">
        {noSourceYet ? (
          <div className="empty-state">
            <h3>Henüz bir kaynak eklemedin</h3>
            <p>Başlamak için bir M3U linki ya da Xtream Codes hesabı ekle.</p>
            <button className="btn-primary" onClick={() => setShowAddSource(true)}>
              + Kaynak Ekle
            </button>
          </div>
        ) : loading && channels.length === 0 ? (
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
        ) : (
          // Oynatıcı burada TEK bir yerde, tüm sekmeler için ortak render
          // ediliyor. Önceden her sekmenin kendi <PlayerPane> kopyası vardı;
          // sekme değiştirince React onu yok edip yeniden kuruyordu, bu da
          // yayının resetlenip ekranın bir an simsiyah kalmasına yol
          // açıyordu. Tek örnek + aynı JSX konumu = sekme değişse de aynı
          // <video> ve bağlantı canlı kalır.
          <div
            className={`browse-row ${view === 'series' ? 'browse-row-series' : ''} ${view === 'favorites' ? 'browse-row-no-categories' : ''}`}
          >
            {view === 'live' && (
              <>
                <CategoryColumn
                  items={channels}
                  activeGroup={liveGroup}
                  onSelectGroup={setLiveGroup}
                  allLabel="Tüm kanallar"
                  orderedGroups={liveCategoryOrder}
                />
                <ItemListColumn
                  items={channels}
                  activeGroup={liveGroup}
                  selectedId={playing?.id}
                  onSelect={playChannel}
                  favoriteIds={favoriteIds}
                  onToggleFavorite={toggleFavorite}
                  emptyTitle="Canlı kanal bulunamadı"
                  emptyHint="Bu kaynakta canlı yayın listesi yok."
                />
              </>
            )}

            {view === 'vod' && (
              <>
                <CategoryColumn
                  items={vod}
                  activeGroup={vodGroup}
                  onSelectGroup={setVodGroup}
                  allLabel="Tüm filmler"
                  orderedGroups={vodCategoryOrder}
                />
                <ItemListColumn
                  items={vod}
                  activeGroup={vodGroup}
                  selectedId={playing?.id}
                  onSelect={playVod}
                  emptyTitle="Film bulunamadı"
                  emptyHint="Filmler yalnızca Xtream Codes kaynaklarında listelenir."
                />
              </>
            )}

            {view === 'series' && (
              <SeriesView
                series={series}
                source={activeSource}
                onPlayEpisode={playEpisode}
                playingId={playing?.id}
              />
            )}

            {view === 'favorites' && (
              <ItemListColumn
                items={favoriteChannels}
                activeGroup={ALL_GROUP}
                selectedId={playing?.id}
                onSelect={playChannel}
                favoriteIds={favoriteIds}
                onToggleFavorite={toggleFavorite}
                emptyTitle="Favori kanalın yok"
                emptyHint="Canlı TV listesinde kanalların üzerindeki yıldıza tıklayarak favorilere ekleyebilirsin."
              />
            )}

            <PlayerPane item={playing} source={activeSource} />
          </div>
        )}
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
    </div>
  )
}

export default App
