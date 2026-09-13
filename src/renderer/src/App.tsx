import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { TopNav, type ViewKey } from './components/TopNav'
import { CategoryColumn, ALL_GROUP } from './components/CategoryColumn'
import { ItemListColumn, type ListableItem, type ListViewMode } from './components/ItemListColumn'
import { MediaBrowser } from './components/media/MediaBrowser'
import { ManageSourcesModal } from './components/ManageSourcesModal'
import { PinPromptModal } from './components/PinPromptModal'
import { ParentalLockSettingsModal } from './components/ParentalLockSettingsModal'
import { EpgGridModal } from './components/EpgGridModal'
import { CategoryEditorModal } from './components/CategoryEditorModal'
import { FavoriteFoldersColumn } from './components/FavoriteFoldersColumn'
import { FolderMenuButton } from './components/FolderMenuButton'
import { RecordingsView } from './components/RecordingsView'
import { SearchOverlay, type SearchKind } from './components/SearchOverlay'
import { IconGuide } from './components/Icons'
import { PlayerPane, type PlayerMode } from './components/PlayerPane'
import type { ChannelDrawerData } from './components/ChannelDrawer'
import {
  applyAccent,
  applyTheme,
  loadAccent,
  loadTheme,
  saveAccent,
  saveTheme,
  type Accent,
  type Theme
} from './lib/theme'
import { applyCategoryOrder, withoutHidden, type CategorySection } from './lib/categoryPrefs'
import { localFileUrl } from './lib/proxy'
import { useSources } from './hooks/useSources'
import { useLibrary } from './hooks/useLibrary'
import { useFavorites } from './hooks/useFavorites'
import { useParentalLock } from './hooks/useParentalLock'
import { useCategoryPrefs } from './hooks/useCategoryPrefs'
import { useRecordings } from './hooks/useRecordings'
import type { Channel, EpgProgram, PlayableItem, RecordingEntry } from '../../shared/types'

const LIST_VIEW_KEY = 'iptv-toto-live-view'

const SECTION_TITLES: Record<CategorySection, string> = {
  live: 'Canlı TV kategorileri',
  vod: 'Film kategorileri',
  series: 'Dizi kategorileri'
}

function loadListView(): ListViewMode {
  try {
    return window.localStorage.getItem(LIST_VIEW_KEY) === 'grid' ? 'grid' : 'list'
  } catch {
    return 'list'
  }
}

function channelToPlayable(c: Channel): PlayableItem {
  return {
    id: c.id,
    name: c.name,
    group: c.group,
    url: c.url,
    streamId: c.streamId,
    isLive: true,
    logo: c.logo,
    kind: 'live'
  }
}

function formatClock(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// Sağlayıcı sırasıyla kategori adları ve içerik sayıları (gizliler dahil)
function groupsWithCounts(items: { group: string }[], order: string[]): { name: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const it of items) counts.set(it.group, (counts.get(it.group) || 0) + 1)
  const orderSet = new Set(order)
  const known = order.filter((g) => counts.has(g))
  const extra = [...counts.keys()].filter((g) => !orderSet.has(g)).sort((a, b) => a.localeCompare(b, 'tr'))
  return [...known, ...extra].map((name) => ({ name, count: counts.get(name) || 0 }))
}

interface MediaOpenRequest {
  kind: 'vod' | 'series'
  id: string
  nonce: number
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
  const favorites = useFavorites()
  const { favoriteIds, toggleFavorite, folders } = favorites
  const lockApi = useParentalLock()
  const categoryPrefs = useCategoryPrefs(activeSourceId)
  const { entries: recordings, active: activeRecording } = useRecordings()

  const [view, setView] = useState<ViewKey>('live')
  const [showManageSources, setShowManageSources] = useState(false)
  const [showParentalLock, setShowParentalLock] = useState(false)
  const [showEpgGrid, setShowEpgGrid] = useState(false)
  const [editSection, setEditSection] = useState<CategorySection | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [mediaOpen, setMediaOpen] = useState<MediaOpenRequest | null>(null)
  const [pendingUnlock, setPendingUnlock] = useState<{ action: () => void } | null>(null)
  const [playing, setPlaying] = useState<PlayableItem | null>(null)
  // Film/dizi tam sayfa oynatılırken önceki canlı yayını hatırla; geri
  // dönünce kaldığı kanaldan devam etsin.
  const [theater, setTheater] = useState(false)
  const [liveBeforeTheater, setLiveBeforeTheater] = useState<PlayableItem | null>(null)
  const [liveGroup, setLiveGroup] = useState(ALL_GROUP)
  const [activeFolder, setActiveFolder] = useState<string | null>(null)
  const [listView, setListView] = useState<ListViewMode>(loadListView)
  const [theme, setTheme] = useState<Theme>(loadTheme)
  const [accent, setAccent] = useState<Accent>(loadAccent)
  // Mini pencere: uygulama küçülüp köşede her zaman üstte kalır
  const [compact, setCompact] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const isLocked = lockApi.isLocked

  // ----- Kategori düzeni (gizlenen / sabitlenen) -----
  const livePrefs = categoryPrefs.get('live')
  const vodPrefs = categoryPrefs.get('vod')
  const seriesPrefs = categoryPrefs.get('series')
  const liveChannels = useMemo(() => withoutHidden(channels, livePrefs), [channels, livePrefs])
  const liveOrder = useMemo(() => applyCategoryOrder(liveCategoryOrder, livePrefs), [liveCategoryOrder, livePrefs])
  const vodVisible = useMemo(() => withoutHidden(vod, vodPrefs), [vod, vodPrefs])
  const vodOrder = useMemo(() => applyCategoryOrder(vodCategoryOrder, vodPrefs), [vodCategoryOrder, vodPrefs])
  const seriesVisible = useMemo(() => withoutHidden(series, seriesPrefs), [series, seriesPrefs])
  const seriesOrder = useMemo(
    () => applyCategoryOrder(seriesCategoryOrder, seriesPrefs),
    [seriesCategoryOrder, seriesPrefs]
  )

  useEffect(() => {
    if (liveGroup !== ALL_GROUP && livePrefs.hidden.includes(liveGroup)) setLiveGroup(ALL_GROUP)
  }, [livePrefs, liveGroup])

  // ----- Favoriler ve klasörler -----
  const favoriteChannels = useMemo(
    () => channels.filter((c) => favoriteIds.has(c.id)),
    [channels, favoriteIds]
  )
  const folderChannels = useMemo(() => {
    const folder = activeFolder ? folders.find((f) => f.id === activeFolder) : undefined
    if (!folder) return favoriteChannels
    const ids = new Set(folder.channelIds)
    return channels.filter((c) => ids.has(c.id))
  }, [activeFolder, folders, favoriteChannels, channels])

  const allGroups = useMemo(() => {
    const set = new Set<string>([...liveCategoryOrder, ...vodCategoryOrder, ...seriesCategoryOrder])
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'tr'))
  }, [liveCategoryOrder, vodCategoryOrder, seriesCategoryOrder])

  const epgSourceChannels = useMemo(
    () => (liveGroup === ALL_GROUP ? liveChannels : liveChannels.filter((c) => c.group === liveGroup)),
    [liveChannels, liveGroup]
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

  // Önceki/sonraki kanal: kanalın seçildiği liste içinde gezilir (favori
  // klasörü ya da seçili kategori). Kilitli kategorilerdeki kanallar atlanır —
  // tam ekranda PIN penceresi görünmeyeceği için oraya geçilmez.
  const navList = useMemo(() => {
    const base = view === 'favorites' ? folderChannels : epgSourceChannels
    const list =
      !playing || base.some((c) => c.id === playing.id)
        ? base
        : channels.filter((c) => c.group === playing.group)
    return list.filter((c) => !isLocked(c.group))
  }, [view, folderChannels, epgSourceChannels, channels, playing, isLocked])

  const unlockedChannels = useMemo(
    () => liveChannels.filter((c) => !isLocked(c.group)),
    [liveChannels, isLocked]
  )
  const drawerGroups = useMemo(() => liveOrder.filter((g) => !isLocked(g)), [liveOrder, isLocked])

  const editorGroups = useMemo(() => {
    if (editSection === 'live') return groupsWithCounts(channels, liveCategoryOrder)
    if (editSection === 'vod') return groupsWithCounts(vod, vodCategoryOrder)
    if (editSection === 'series') return groupsWithCounts(series, seriesCategoryOrder)
    return []
  }, [editSection, channels, vod, series, liveCategoryOrder, vodCategoryOrder, seriesCategoryOrder])

  // ----- Bildirim şeridi -----
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 8000)
    return () => clearTimeout(t)
  }, [notice])

  // ⌘K / Ctrl+K: her yerde ara
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Planlanmış kayıt başladığında başka bir kanal izleniyorsa: hesap tek
  // bağlantılı olduğu için kaydedilen kanala geç ve kullanıcıya söyle.
  useEffect(() => {
    if (!activeRecording) return
    if (playing?.isLive && playing.url !== activeRecording.url) {
      const ch =
        channels.find((c) => c.id === activeRecording.channelId) ||
        channels.find((c) => c.url === activeRecording.url)
      if (ch) setPlaying(channelToPlayable(ch))
      setNotice(
        `Kayıt başladı: ${activeRecording.title}. Hesap tek bağlantılı olduğu için kaydedilen kanala geçildi.`
      )
    } else if (playing && !playing.isLive && playing.kind !== 'recording') {
      setNotice(
        `Kayıt başladı: ${activeRecording.title}. Hesap tek bağlantılı olduğu için film/dizi bağlantısı kesilebilir.`
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRecording?.id])

  // Bir grup (kategori) kilitliyse işlemi hemen yapmak yerine PIN sorup
  // bekletiyoruz; doğru PIN girilince orijinal işlem çalışır.
  function guardedAction(group: string, action: () => void): void {
    if (lockApi.isLocked(group)) {
      setPendingUnlock({ action })
    } else {
      action()
    }
  }

  // Kayıt sürerken sunucuya ikinci bağlantı açacak bir şey yapılacaksa sor
  function confirmRecordingInterrupt(what: string): boolean {
    if (!activeRecording) return true
    const ok = window.confirm(
      `“${activeRecording.title}” şu an kaydediliyor.\n\nHesabın aynı anda tek bağlantıya izin verdiği için ${what} kaydı durdurur. Kayıt durdurulsun mu?`
    )
    if (ok) void window.iptv.recordings.stop(activeRecording.id)
    return ok
  }

  function playChannel(item: ListableItem): void {
    const channel = item as Channel
    guardedAction(channel.group, () => {
      if (
        activeRecording &&
        activeRecording.url !== channel.url &&
        !confirmRecordingInterrupt('başka bir kanal açmak')
      ) {
        return
      }
      setTheater(false)
      setPlaying(channelToPlayable(channel))
    })
  }

  function onTuneFromEpg(channelId: string): void {
    const ch = channels.find((c) => c.id === channelId)
    if (ch) playChannel(ch)
    setShowEpgGrid(false)
  }

  function playFromBrowser(item: PlayableItem): void {
    if (item.kind !== 'recording' && activeRecording && !confirmRecordingInterrupt('film/dizi açmak')) {
      return
    }
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

  function changeTheme(next: Theme): void {
    setTheme(next)
    applyTheme(next)
    saveTheme(next)
  }

  function changeAccent(next: Accent): void {
    setAccent(next)
    applyAccent(next)
    saveAccent(next)
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

  // ----- Kayıt -----
  async function toggleRecordCurrent(info: { programTitle?: string; end?: number }): Promise<void> {
    const current = playing
    if (!current?.isLive) return
    if (activeRecording && activeRecording.url === current.url) {
      await window.iptv.recordings.stop(activeRecording.id)
      setNotice('Kayıt durduruldu. Kayıtlar sekmesinden izleyebilirsin.')
      return
    }
    const now = Date.now()
    // Program bilgisi varsa program bitene kadar (+1 dk pay), yoksa 1 saat
    const end = info.end && info.end > now + 60_000 ? info.end + 60_000 : now + 60 * 60_000
    const res = await window.iptv.recordings.schedule({
      title: info.programTitle ? `${current.name} · ${info.programTitle}` : current.name,
      channelName: current.name,
      channelId: current.id,
      logo: current.logo,
      url: current.url,
      start: now,
      end
    })
    setNotice(
      res.ok
        ? `Kayıt başladı — saat ${formatClock(end)} olunca bitecek. Kayıtlar sekmesinden durdurabilirsin.`
        : res.error || 'Kayıt başlatılamadı'
    )
  }

  async function recordProgram(streamId: number, program: EpgProgram): Promise<string> {
    const ch = channels.find((c) => c.streamId === streamId)
    if (!ch) return 'Kanal bulunamadı'
    const res = await window.iptv.recordings.schedule({
      title: `${ch.name} · ${program.title}`,
      channelName: ch.name,
      channelId: ch.id,
      logo: ch.logo,
      url: ch.url,
      // Programlar genelde birkaç dakika kayar: 1 dk önce başla, 2 dk sonra bitir
      start: program.start - 60_000,
      end: program.end + 120_000
    })
    return res.ok
      ? `Kayıt planlandı (${formatClock(program.start)}). Uygulama o saatte açık olmalı.`
      : res.error || 'Kayıt planlanamadı'
  }

  function playRecording(e: RecordingEntry): void {
    if (!e.path) return
    playFromBrowser({
      id: `rec-${e.id}`,
      name: e.title,
      group: e.channelName,
      url: localFileUrl(e.path),
      isLive: false,
      logo: e.logo,
      kind: 'recording'
    })
  }

  // ----- Arama -----
  function openFromSearch(kind: SearchKind, id: string): void {
    setSearchOpen(false)
    if (kind === 'live') {
      const ch = channels.find((c) => c.id === id)
      if (ch) {
        setView('live')
        playChannel(ch)
      }
      return
    }
    setView(kind)
    setMediaOpen({ kind, id, nonce: Date.now() })
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
  const isMediaView = view === 'vod' || view === 'series' || view === 'recordings'
  const hostMode: PlayerMode | 'hidden' = noSourceYet
    ? 'hidden'
    : theater && playing
      ? 'theater'
      : !isMediaView
        ? 'docked'
        : playing
          ? 'mini'
          : 'hidden'
  const recordingThis = !!activeRecording && !!playing?.isLive && activeRecording.url === playing.url
  const blockedBy =
    activeRecording && playing?.isLive && activeRecording.url !== playing.url
      ? activeRecording.title
      : undefined

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
            items={liveChannels}
            activeGroup={liveGroup}
            onSelectGroup={(g) => guardedAction(g, () => setLiveGroup(g))}
            allLabel="Tüm kanallar"
            orderedGroups={liveOrder}
            lockedGroups={lockApi.lockedGroups}
            onEdit={() => setEditSection('live')}
          />
          <ItemListColumn
            items={liveChannels}
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
      <>
        <FavoriteFoldersColumn
          folders={folders}
          allCount={favoriteChannels.length}
          activeFolder={activeFolder}
          onSelect={setActiveFolder}
          onCreate={(name) => setActiveFolder(favorites.createFolder(name))}
          onRename={favorites.renameFolder}
          onDelete={(id) => {
            favorites.deleteFolder(id)
            if (activeFolder === id) setActiveFolder(null)
          }}
        />
        <ItemListColumn
          items={folderChannels}
          activeGroup={ALL_GROUP}
          selectedId={playing?.id}
          onSelect={playChannel}
          favoriteIds={favoriteIds}
          onToggleFavorite={toggleFavorite}
          emptyTitle={activeFolder ? 'Bu klasör boş' : 'Favori kanalın yok'}
          emptyHint={
            activeFolder
              ? '“Tüm favoriler”den bir kanalın yanındaki klasör simgesine tıklayıp bu klasöre ekleyebilirsin.'
              : 'Canlı TV listesinde kanalların üzerindeki yıldıza tıklayarak favorilere ekleyebilirsin.'
          }
          viewMode={listView}
          onViewModeChange={changeListView}
          renderRowExtra={(item) => (
            <FolderMenuButton
              channelId={item.id}
              folders={folders}
              onToggle={favorites.toggleInFolder}
              onCreate={favorites.createFolder}
            />
          )}
        />
      </>
    )
  } else if (view === 'recordings') {
    leftArea = (
      <RecordingsView
        entries={recordings}
        onPlay={playRecording}
        onStop={(id) => void window.iptv.recordings.stop(id)}
        onRemove={(e, deleteFile) => void window.iptv.recordings.remove(e.id, deleteFile)}
        onOpenFolder={() => void window.iptv.recordings.openFolder()}
        onShowFile={(p) => void window.iptv.shell.showItem(p)}
      />
    )
  }

  const mediaKind = view === 'vod' || view === 'series' ? view : null

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
        onThemeChange={changeTheme}
        accent={accent}
        onAccentChange={changeAccent}
        onOpenSearch={() => setSearchOpen(true)}
        recordingActive={!!activeRecording}
      />

      <div className="app-body">
        {/* Çocukların SIRASI sabit tutuluyor: oynatıcı her zaman son sırada,
            böylece sekme değişse de React onu yeniden kurmuyor ve yayın
            kesilmiyor. Görünüşü (yan panel / köşe / tam sayfa) CSS ile değişir. */}
        <div className={`main-area view-${view}`}>
          {leftArea}
          {!noSourceYet && mediaKind ? (
            <MediaBrowser
              key={`${mediaKind}-${activeSourceId}`}
              kind={mediaKind}
              vod={vodVisible}
              series={seriesVisible}
              categoryOrder={mediaKind === 'vod' ? vodOrder : seriesOrder}
              status={mediaKind === 'vod' ? vodStatus : seriesStatus}
              source={activeSource}
              lockedGroups={lockApi.lockedGroups}
              isLocked={lockApi.isLocked}
              guard={guardedAction}
              onPlay={playFromBrowser}
              openRequest={mediaOpen?.kind === mediaKind ? mediaOpen : null}
              onEditCategories={() => setEditSection(mediaKind)}
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
              recording={recordingThis}
              onRecordToggle={playing?.isLive ? (info) => void toggleRecordCurrent(info) : undefined}
              blockedByRecording={blockedBy}
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
          onRecordProgram={recordProgram}
        />
      )}

      {editSection && (
        <CategoryEditorModal
          title={SECTION_TITLES[editSection]}
          groups={editorGroups}
          prefs={categoryPrefs.get(editSection)}
          onToggleHidden={(g) => categoryPrefs.toggleHidden(editSection, g)}
          onTogglePinned={(g) => categoryPrefs.togglePinned(editSection, g)}
          onMovePinned={(g, dir) => categoryPrefs.movePinned(editSection, g, dir)}
          onReset={() => categoryPrefs.reset(editSection)}
          onClose={() => setEditSection(null)}
        />
      )}

      {searchOpen && (
        <SearchOverlay
          channels={liveChannels}
          vod={vodVisible}
          series={seriesVisible}
          isLocked={isLocked}
          onPick={openFromSearch}
          onClose={() => setSearchOpen(false)}
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

      {notice && (
        <div className="app-notice" onClick={() => setNotice(null)}>
          {notice}
        </div>
      )}
    </div>
  )
}

export default App
