import { useMemo, useState, type ReactElement } from 'react'
import { TopNav, type ViewKey } from './components/TopNav'
import { CategoryColumn, ALL_GROUP } from './components/CategoryColumn'
import { ItemListColumn, type ListableItem } from './components/ItemListColumn'
import { SeriesView } from './components/SeriesView'
import { ManageSourcesModal } from './components/ManageSourcesModal'
import { VodDetailModal } from './components/VodDetailModal'
import { PinPromptModal } from './components/PinPromptModal'
import { ParentalLockSettingsModal } from './components/ParentalLockSettingsModal'
import { EpgGridModal } from './components/EpgGridModal'
import { IconGuide } from './components/Icons'
import { PlayerPane, type PlayableItem } from './components/PlayerPane'
import { useSources } from './hooks/useSources'
import { useLibrary } from './hooks/useLibrary'
import { useFavorites } from './hooks/useFavorites'
import { useParentalLock } from './hooks/useParentalLock'
import type { Channel, VodItem } from '../../shared/types'
import { getVodStreamUrl } from './lib/xtream'

function App(): ReactElement {
  const {
    sources,
    activeSource,
    activeSourceId,
    ready,
    addSource,
    updateSource,
    removeSource,
    setActiveSourceId
  } = useSources()
  const { channels, vod, series, liveCategoryOrder, vodCategoryOrder, loading, error, reload } =
    useLibrary(activeSource)
  const { favoriteIds, toggleFavorite } = useFavorites()
  const lockApi = useParentalLock()

  const [view, setView] = useState<ViewKey>('live')
  const [showManageSources, setShowManageSources] = useState(false)
  const [showParentalLock, setShowParentalLock] = useState(false)
  const [showEpgGrid, setShowEpgGrid] = useState(false)
  const [pendingUnlock, setPendingUnlock] = useState<{ action: () => void } | null>(null)
  const [vodDetail, setVodDetail] = useState<VodItem | null>(null)
  const [playing, setPlaying] = useState<PlayableItem | null>(null)
  const [liveGroup, setLiveGroup] = useState(ALL_GROUP)
  const [vodGroup, setVodGroup] = useState(ALL_GROUP)

  const favoriteChannels = useMemo(
    () => channels.filter((c) => favoriteIds.has(c.id)),
    [channels, favoriteIds]
  )

  const allGroups = useMemo(() => {
    const set = new Set<string>([...liveCategoryOrder, ...vodCategoryOrder])
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'tr'))
  }, [liveCategoryOrder, vodCategoryOrder])

  const epgSourceChannels = useMemo(
    () => (liveGroup === ALL_GROUP ? channels : channels.filter((c) => c.group === liveGroup)),
    [channels, liveGroup]
  )
  const epgChannels = useMemo(
    () =>
      epgSourceChannels
        .filter((c): c is Channel & { streamId: number } => c.streamId !== undefined)
        .slice(0, 60)
        .map((c) => ({ streamId: c.streamId, name: c.name, logo: c.logo, id: c.id, group: c.group })),
    [epgSourceChannels]
  )
  const epgTruncated = epgSourceChannels.length > epgChannels.length

  function onTuneFromEpg(channelId: string): void {
    const ch = channels.find((c) => c.id === channelId)
    if (ch) playChannel(ch)
    setShowEpgGrid(false)
  }

  // Bir grup (kategori) kilitliyse işlemi hemen yapmak yerine PIN sorup
  // bekletiyoruz; doğru PIN girilince orijinal işlem çalışır.
  function guardedAction(group: string, action: () => void): void {
    if (lockApi.isLocked(group)) {
      setPendingUnlock({ action })
    } else {
      action()
    }
  }

  function playChannel(item: ListableItem): void {
    const channel = item as Channel
    guardedAction(channel.group, () => {
      setPlaying({
        id: channel.id,
        name: channel.name,
        group: channel.group,
        url: channel.url,
        streamId: channel.streamId,
        isLive: true
      })
    })
  }

  function openVodDetail(item: ListableItem): void {
    const vodItem = item as VodItem
    guardedAction(vodItem.group, () => setVodDetail(vodItem))
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
    setVodDetail(null)
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
        onManageSources={() => setShowManageSources(true)}
        onOpenParentalLock={() => setShowParentalLock(true)}
        onReload={reload}
        loading={loading}
      />

      <div className="app-body">
        {noSourceYet ? (
          <div className="empty-state">
            <h3>Henüz bir kaynak eklemedin</h3>
            <p>Başlamak için bir M3U linki ya da Xtream Codes hesabı ekle.</p>
            <button className="btn-primary" onClick={() => setShowManageSources(true)}>
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
                  onSelectGroup={(g) => guardedAction(g, () => setLiveGroup(g))}
                  allLabel="Tüm kanallar"
                  orderedGroups={liveCategoryOrder}
                  lockedGroups={lockApi.lockedGroups}
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
                  headerAction={
                    activeSource?.type === 'xtream' ? (
                      <button
                        className="icon-btn"
                        onClick={() => setShowEpgGrid(true)}
                        title="TV Rehberi"
                      >
                        <IconGuide size={15} />
                      </button>
                    ) : undefined
                  }
                />
              </>
            )}

            {view === 'vod' && (
              <>
                <CategoryColumn
                  items={vod}
                  activeGroup={vodGroup}
                  onSelectGroup={(g) => guardedAction(g, () => setVodGroup(g))}
                  allLabel="Tüm filmler"
                  orderedGroups={vodCategoryOrder}
                  lockedGroups={lockApi.lockedGroups}
                />
                <ItemListColumn
                  items={vod}
                  activeGroup={vodGroup}
                  selectedId={playing?.id}
                  onSelect={openVodDetail}
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

      {showManageSources && (
        <ManageSourcesModal
          sources={sources}
          onClose={() => setShowManageSources(false)}
          onAdd={addSource}
          onUpdate={updateSource}
          onRemove={removeSource}
        />
      )}

      {vodDetail && (
        <VodDetailModal
          item={vodDetail}
          source={activeSource}
          onClose={() => setVodDetail(null)}
          onPlay={playVod}
        />
      )}

      {showParentalLock && (
        <ParentalLockSettingsModal
          api={lockApi}
          allGroups={allGroups}
          onClose={() => setShowParentalLock(false)}
        />
      )}

      {showEpgGrid && activeSource?.type === 'xtream' && (
        <EpgGridModal
          source={activeSource}
          channels={epgChannels}
          categoryLabel={liveGroup === ALL_GROUP ? 'Tüm kanallar' : liveGroup}
          truncated={epgTruncated}
          onClose={() => setShowEpgGrid(false)}
          onTuneChannel={onTuneFromEpg}
        />
      )}

      {pendingUnlock && (
        <PinPromptModal
          onSubmit={(pin) => lockApi.tryUnlock(pin)}
          onSuccess={() => {
            pendingUnlock.action()
            setPendingUnlock(null)
          }}
          onCancel={() => setPendingUnlock(null)}
        />
      )}
    </div>
  )
}

export default App
