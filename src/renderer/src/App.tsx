import { useMemo, useState, type ReactElement } from 'react'
import { TopNav, type ViewKey } from './components/TopNav'
import { CategoryColumn, ALL_GROUP } from './components/CategoryColumn'
import { ItemListColumn, type ListableItem, type ListViewMode } from './components/ItemListColumn'
import { MediaBrowser } from './components/media/MediaBrowser'
import { ManageSourcesModal } from './components/ManageSourcesModal'
import { PinPromptModal } from './components/PinPromptModal'
import { ParentalLockSettingsModal } from './components/ParentalLockSettingsModal'
import { EpgGridModal } from './components/EpgGridModal'
import { IconGuide } from './components/Icons'
import { PlayerPane, type PlayerMode } from './components/PlayerPane'
import type { ChannelDrawerData } from './components/ChannelDrawer'
import { applyTheme, loadTheme, saveTheme, type Theme } from './lib/theme'
import { useSources } from './hooks/useSources'
import { useLibrary } from './hooks/useLibrary'
import { useFavorites } from './hooks/useFavorites'
import { useParentalLock } from './hooks/useParentalLock'
import type { Channel, PlayableItem } from '../../shared/types'

const LIST_VIEW_KEY = 'iptv-toto-live-view'

function loadListView(): ListViewMode {
  try {
    return window.localStorage.getItem(LIST_VIEW_KEY) === 'grid' ? 'grid' : 'list'
  } catch {
    return 'list'
  }
}

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
  const {
    channels,
    vod,
    series,
    liveCategoryOrder,
    vodCategoryOrder,
    seriesCategoryOrder,
    liveStatus,
    vodStatus,
    seriesStatus,
    refreshing,
    loading,
    error,
    reload
  } = useLibrary(activeSource)
  const { favoriteIds, toggleFavorite } = useFavorites()
  const lockApi = useParentalLock()

  const [view, setView] = useState<ViewKey>('live')
  const [showManageSources, setShowManageSources] = useState(false)
  const [showParentalLock, setShowParentalLock] = useState(false)
  const [showEpgGrid, setShowEpgGrid] = useState(false)
  const [pendingUnlock, setPendingUnlock] = useState<{ action: () => void } | null>(null)
  const [playing, setPlaying] = useState<PlayableItem | null>(null)
  // Film/dizi tam sayfa oynatılırken önceki canlı yayını hatırla; geri
  // dönünce kaldığı kanaldan devam etsin.
  const [theater, setTheater] = useState(false)
  const [liveBeforeTheater, setLiveBeforeTheater] = useState<PlayableItem | null>(null)
  const [liveGroup, setLiveGroup] = useState(ALL_GROUP)
  const [listView, setListView] = useState<ListViewMode>(loadListView)
  const [theme, setTheme] = useState<Theme>(loadTheme)
  // Mini pencere: uygulama küçülüp köşede her zaman üstte kalır
  const [compact, setCompact] = useState(false)

  const favoriteChannels = useMemo(
    () => channels.filter((c) => favoriteIds.has(c.id)),
    [channels, favoriteIds]
  )

  const allGroups = useMemo(() => {
    const set = new Set<string>([...liveCategoryOrder, ...vodCategoryOrder, ...seriesCategoryOrder])
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'tr'))
  }, [liveCategoryOrder, vodCategoryOrder, seriesCategoryOrder])

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

  // Önceki/sonraki kanal: kanalın seçildiği liste içinde gezilir (favoriler
  // ya da seçili kategori). Kilitli kategorilerdeki kanallar atlanır — tam
  // ekranda PIN penceresi görünmeyeceği için oraya geçilmez.
  const isLocked = lockApi.isLocked
  const navList = useMemo(() => {
    const base = view === 'favorites' ? favoriteChannels : epgSourceChannels
    const list =
      !playing || base.some((c) => c.id === playing.id)
        ? base
        : channels.filter((c) => c.group === playing.group)
    return list.filter((c) => !isLocked(c.group))
  }, [view, favoriteChannels, epgSourceChannels, channels, playing, isLocked])

  const unlockedChannels = useMemo(
    () => channels.filter((c) => !isLocked(c.group)),
    [channels, isLocked]
  )
  const drawerGroups = useMemo(
    () => liveCategoryOrder.filter((g) => !isLocked(g)),
    [liveCategoryOrder, isLocked]
  )

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
      setTheater(false)
      setPlaying({
        id: channel.id,
        name: channel.name,
        group: channel.group,
        url: channel.url,
        streamId: channel.streamId,
        isLive: true,
        logo: channel.logo,
        kind: 'live'
      })
    })
  }

  function onTuneFromEpg(channelId: string): void {
    const ch = channels.find((c) => c.id === channelId)
    if (ch) playChannel(ch)
    setShowEpgGrid(false)
  }

  function playFromBrowser(item: PlayableItem): void {
    if (playing?.isLive) setLiveBeforeTheater(playing)
    setPlaying(item)
    setTheater(true)
  }

  function closeTheater(): void {
    setTheater(false)
    setPlaying(liveBeforeTheater)
    setLiveBeforeTheater(null)
  }

  function changeListView(mode: ListViewMode): void {
    setListView(mode)
    try {
      window.localStorage.setItem(LIST_VIEW_KEY, mode)
    } catch {
      /* ignore */
    }
  }

  function toggleTheme(): void {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    applyTheme(next)
    saveTheme(next)
  }

  function setCompactMode(on: boolean): void {
    setCompact(on)
    document.body.classList.toggle('compact-mode', on)
    void window.iptv.window.setCompact(on)
  }

  // Uyku zamanlayıcısı dolunca: oynatmayı tamamen durdur (sunucu bağlantısı da kapanır)
  function stopPlayback(): void {
    setTheater(false)
    setPlaying(null)
    setLiveBeforeTheater(null)
    if (compact) setCompactMode(false)
  }

  function stepChannel(delta: number): void {
    if (!playing?.isLive || navList.length === 0) return
    const idx = navList.findIndex((c) => c.id === playing.id)
    const next = navList[(idx + delta + navList.length) % navList.length]
    if (next && next.id !== playing.id) playChannel(next)
  }

  const drawerData: ChannelDrawerData = {
    channels: unlockedChannels,
    groups: drawerGroups,
    activeGroup: liveGroup,
    onGroupChange: setLiveGroup,
    onPick: playChannel
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
  const isMediaView = view === 'vod' || view === 'series'
  const hostMode: PlayerMode | 'hidden' = noSourceYet
    ? 'hidden'
    : theater && playing
      ? 'theater'
      : !isMediaView
        ? 'docked'
        : playing
          ? 'mini'
          : 'hidden'

  let leftArea: ReactElement | null = null
  if (noSourceYet) {
    leftArea = (
      <div className="empty-state">
        <h3>Henüz bir kaynak eklemedin</h3>
        <p>Başlamak için bir M3U linki ya da Xtream Codes hesabı ekle.</p>
        <button className="btn-primary" onClick={() => setShowManageSources(true)}>
          + Kaynak Ekle
        </button>
      </div>
    )
  } else if (view === 'live') {
    if (loading && channels.length === 0) {
      leftArea = (
        <div className="pane pane-wide">
          <div className="empty-state">
            <div className="spinner" />
            <p>İçerik yükleniyor…</p>
          </div>
        </div>
      )
    } else if (error && channels.length === 0) {
      leftArea = (
        <div className="pane pane-wide">
          <div className="empty-state">
            <h3>Bir sorun oluştu</h3>
            <p>{error}</p>
            <button className="btn-primary" onClick={reload}>
              Tekrar Dene
            </button>
          </div>
        </div>
      )
    } else {
      leftArea = (
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
            emptyHint={liveStatus === 'ready' ? 'Bu kaynakta canlı yayın listesi yok.' : ''}
            viewMode={listView}
            onViewModeChange={changeListView}
            headerAction={
              activeSource?.type === 'xtream' ? (
                <button className="icon-btn" onClick={() => setShowEpgGrid(true)} title="TV Rehberi">
                  <IconGuide size={15} />
                </button>
              ) : undefined
            }
          />
        </>
      )
    }
  } else if (view === 'favorites') {
    leftArea = (
      <ItemListColumn
        items={favoriteChannels}
        activeGroup={ALL_GROUP}
        selectedId={playing?.id}
        onSelect={playChannel}
        favoriteIds={favoriteIds}
        onToggleFavorite={toggleFavorite}
        emptyTitle="Favori kanalın yok"
        emptyHint="Canlı TV listesinde kanalların üzerindeki yıldıza tıklayarak favorilere ekleyebilirsin."
        viewMode={listView}
        onViewModeChange={changeListView}
      />
    )
  }

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
        loading={loading || refreshing}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <div className="app-body">
        {/* Çocukların SIRASI sabit tutuluyor: oynatıcı her zaman son sırada,
            böylece sekme değişse de React onu yeniden kurmuyor ve yayın
            kesilmiyor. Görünüşü (yan panel / köşe / tam sayfa) CSS ile değişir. */}
        <div className={`main-area view-${view}`}>
          {leftArea}
          {!noSourceYet && isMediaView ? (
            <MediaBrowser
              key={`${view}-${activeSourceId}`}
              kind={view as 'vod' | 'series'}
              vod={vod}
              series={series}
              categoryOrder={view === 'vod' ? vodCategoryOrder : seriesCategoryOrder}
              status={view === 'vod' ? vodStatus : seriesStatus}
              source={activeSource}
              lockedGroups={lockApi.lockedGroups}
              isLocked={lockApi.isLocked}
              guard={guardedAction}
              onPlay={playFromBrowser}
            />
          ) : null}
          <div key="player-host" className={`player-host host-${hostMode}`}>
            <PlayerPane
              item={playing}
              source={activeSource}
              mode={compact || hostMode === 'hidden' ? 'docked' : hostMode}
              isFavorite={!!playing && favoriteIds.has(playing.id)}
              onToggleFavorite={playing?.isLive ? () => toggleFavorite(playing.id) : undefined}
              onClose={hostMode === 'theater' ? closeTheater : () => setPlaying(null)}
              onExpand={() => setView('live')}
              onPrev={hostMode === 'docked' && playing?.isLive ? () => stepChannel(-1) : undefined}
              onNext={hostMode === 'docked' && playing?.isLive ? () => stepChannel(1) : undefined}
              drawer={hostMode === 'docked' && playing?.isLive ? drawerData : undefined}
              onStop={stopPlayback}
              onPlayItem={setPlaying}
              compact={compact}
              onToggleCompact={() => setCompactMode(!compact)}
            />
          </div>
        </div>
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
