import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { flushSync } from 'react-dom'
import { TopNav, type ViewKey } from './components/TopNav'
import { CategoryColumn, ALL_GROUP } from './components/CategoryColumn'
import {
  ItemListColumn,
  type ChannelMeta,
  type ListableItem,
  type ListViewMode
} from './components/ItemListColumn'
import { MediaBrowser } from './components/media/MediaBrowser'
import { LiveShowcase } from './components/live/LiveShowcase'
import { ManageSourcesModal } from './components/ManageSourcesModal'
import { PinPromptModal } from './components/PinPromptModal'
import { ParentalLockSettingsModal } from './components/ParentalLockSettingsModal'
import { EpgGridModal } from './components/EpgGridModal'
import { CategoryEditorModal } from './components/CategoryEditorModal'
import { FavoriteFoldersColumn } from './components/FavoriteFoldersColumn'
import { FolderMenuButton } from './components/FolderMenuButton'
import { RecordingsView } from './components/RecordingsView'
import { SearchOverlay, type SearchKind } from './components/SearchOverlay'
import { GuideView } from './components/GuideView'
import { SettingsModal } from './components/SettingsModal'
import { GlobalTooltip } from './components/GlobalTooltip'
import { WatchlistView } from './components/WatchlistView'
import { StatsView } from './components/StatsView'
import { MultiView } from './components/MultiView'
import { useFollowChecker } from './hooks/useFollowChecker'
import { watchlistStore } from './lib/library'
import { IconGrid, IconGuide, IconLiveTv, IconRecord, IconStar } from './components/Icons'
import { ContextMenu } from './components/ContextMenu'
import { SkeletonChannelList } from './components/Skeleton'
import { EmptyIllustration } from './components/EmptyIllustration'
import { PlayerPane, type PlayerMode } from './components/PlayerPane'
import type { ChannelDrawerData } from './components/ChannelDrawer'
import {
  applyAccent,
  applyPosterSize,
  applyTheme,
  loadAccent,
  loadPosterShape,
  loadPosterSize,
  loadTheme,
  saveAccent,
  savePosterShape,
  savePosterSize,
  saveTheme,
  type Accent,
  type PosterShape,
  type PosterSize,
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
import { useEpgIndex } from './hooks/useEpgIndex'
import { useReminders } from './hooks/useReminders'
import { REMINDER_LEAD_MS, type Reminder } from './lib/reminders'
import { fold } from './lib/search'
import { getAccountInfo, getTimeshiftUrl } from './lib/xtream'
import { currentProgram, type IndexedChannel } from './lib/epgIndex'
import type { Channel, EpgProgram, PlayableItem, RecordingEntry } from '../../shared/types'

const LIST_VIEW_KEY = 'iptv-toto-live-view'
const LIVE_LAYOUT_KEY = 'iptv-toto-live-layout'

type LiveLayout = 'showcase' | 'classic'

function loadLiveLayout(): LiveLayout {
  try {
    return window.localStorage.getItem(LIVE_LAYOUT_KEY) === 'classic' ? 'classic' : 'showcase'
  } catch {
    return 'showcase'
  }
}

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

interface NoticeAction {
  label: string
  run: () => void
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
    refreshFailed,
    loading,
    error,
    reload
  } = useLibrary(activeSource)
  // Bildirimdeki "Kanala geç" gibi sonradan çalışan eylemler güncel listeyi görsün
  const channelsRef = useRef(channels)
  channelsRef.current = channels
  const favorites = useFavorites()
  const { favoriteIds, toggleFavorite, folders } = favorites
  const lockApi = useParentalLock()
  const categoryPrefs = useCategoryPrefs(activeSourceId)
  const { entries: recordings, active: activeRecording } = useRecordings()
  const reminders = useReminders()

  // Takip edilen dizilere yeni bölüm gelince haber ver
  useFollowChecker(activeSource, (s, added) => {
    const text = `“${s.name}” dizisine ${added} yeni bölüm eklendi.`
    try {
      new Notification('IPTV Toto · Yeni bölüm', { body: text })
    } catch {
      /* sistem bildirimi gösterilemedi */
    }
    setNotice(text, {
      label: 'Diziye git',
      run: () => {
        changeView('series')
        setMediaOpen({ kind: 'series', id: `xtream-series-${s.seriesId}`, nonce: Date.now() })
      }
    })
  })

  const [view, setView] = useState<ViewKey>('live')
  const [showManageSources, setShowManageSources] = useState(false)
  const [showParentalLock, setShowParentalLock] = useState(false)
  const [showEpgGrid, setShowEpgGrid] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
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
  const [liveLayout, setLiveLayoutState] = useState<LiveLayout>(loadLiveLayout)
  function setLiveLayout(next: LiveLayout): void {
    setLiveLayoutState(next)
    try {
      window.localStorage.setItem(LIVE_LAYOUT_KEY, next)
    } catch {
      /* ignore */
    }
  }
  const [activeFolder, setActiveFolder] = useState<string | null>(null)
  const [listView, setListView] = useState<ListViewMode>(loadListView)
  const [theme, setTheme] = useState<Theme>(loadTheme)
  const [accent, setAccent] = useState<Accent>(loadAccent)
  const [posterSize, setPosterSize] = useState<PosterSize>(loadPosterSize)
  const [posterShape, setPosterShape] = useState<PosterShape>(loadPosterShape)
  // Mini pencere: uygulama küçülüp köşede her zaman üstte kalır
  const [compact, setCompact] = useState(false)
  // Çoklu ekran açıkken: başlangıç kanalı, hesabın bağlantı sınırı, kapanınca dönülecek yayın
  const [multiView, setMultiView] = useState<{
    start: Channel | null
    maxSlots: number | null
    resume: PlayableItem | null
  } | null>(null)
  const [notice, setNoticeState] = useState<{ text: string; action?: NoticeAction } | null>(null)
  // Güncelleme durumu, geçici bildirimden bağımsız olarak kalıcı: bildirim
  // kapansa/gözden kaçsa bile hesap menüsündeki rozetten her zaman erişilebilir.
  const [updateInfo, setUpdateInfo] = useState<{ version: string; ready: boolean } | null>(null)
  const [channelMenu, setChannelMenu] = useState<{ channel: Channel; x: number; y: number } | null>(null)

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

  // ----- Rehber dizini (şimdi yayında, maç merkezi, program araması) -----
  const epgIndex = useEpgIndex(activeSource, channels, liveOrder, favoriteIds)

  // Kanal listesinde "şu an yayında" satırı: dakikada bir tazelenir
  const [minuteTick, setMinuteTick] = useState(() => Date.now())
  useEffect(() => {
    const iv = setInterval(() => setMinuteTick(Date.now()), 60_000)
    return () => clearInterval(iv)
  }, [])
  const liveNow = useMemo(() => {
    const map = new Map<number, ChannelMeta>()
    for (const ch of epgIndex.channels) {
      const p = currentProgram(ch, minuteTick)
      if (p) map.set(ch.streamId, { now: p.title, progress: (minuteTick - p.start) / (p.end - p.start) })
    }
    return map
  }, [epgIndex.channels, minuteTick])
  const getLiveMeta = useMemo(
    () =>
      (item: ListableItem): ChannelMeta | undefined => {
        const sid = (item as Channel).streamId
        return sid !== undefined ? liveNow.get(sid) : undefined
      },
    [liveNow]
  )
  const programHits = useMemo(() => {
    const now = Date.now()
    return epgIndex.channels
      .filter((ch) => !isLocked(ch.group))
      .flatMap((ch) =>
        ch.programs
          .filter((p) => p.end > now)
          .map((p) => ({ key: `${ch.streamId}-${p.start}`, channel: ch, program: p, folded: fold(p.title) }))
      )
  }, [epgIndex.channels, isLocked])
  const channelByStream = useMemo(() => {
    const map = new Map<number, Channel>()
    for (const c of channels) if (c.streamId !== undefined) map.set(c.streamId, c)
    return map
  }, [channels])

  useEffect(() => {
    if (liveGroup !== ALL_GROUP && livePrefs.hidden.includes(liveGroup)) setLiveGroup(ALL_GROUP)
  }, [livePrefs, liveGroup])

  // ----- Favoriler ve klasörler -----
  // Favoriler kendi (elle sıralanabilir) sırasında gösterilir, sağlayıcının
  // listesindeki sırada değil.
  const favoriteChannels = useMemo(() => {
    const byId = new Map(channels.map((c) => [c.id, c]))
    return favorites.orderedFavoriteIds.map((id) => byId.get(id)).filter((c): c is Channel => !!c)
  }, [channels, favorites.orderedFavoriteIds])
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
        .map((c) => ({
          streamId: c.streamId,
          name: c.name,
          logo: c.logo,
          id: c.id,
          group: c.group,
          archiveDays: c.archiveDays
        })),
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
    const t = setTimeout(() => setNoticeState(null), notice.action ? 25000 : 8000)
    return () => clearTimeout(t)
  }, [notice])

  // Hatırlatıcılar: program başlamadan 5 dakika önce bildirim
  useEffect(() => {
    const check = (): void => {
      // Kanal listesi yüklenmeden bildirme ("Kanala geç" çalışabilsin)
      if (channelsRef.current.length === 0) return
      const now = Date.now()
      for (const r of reminders.reminders) {
        if (!r.notified && r.start - REMINDER_LEAD_MS <= now && r.end > now) {
          reminders.markNotified(r.id)
          fireReminder(r)
        }
      }
    }
    check()
    const iv = setInterval(check, 15000)
    return () => clearInterval(iv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reminders.reminders, channels.length > 0])

  // Liste tazelenemediyse bilgi ver (kayıtlı liste gösterilmeye devam eder)
  useEffect(() => {
    if (refreshFailed) {
      setNotice('Sunucuya ulaşılamadı; kayıtlı liste gösteriliyor. Birkaç dakika içinde tekrar denenecek.')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshFailed])

  // Yeni sürüm arka planda inip hazır olunca haber ver
  useEffect(() => {
    return window.iptv.updater?.onEvent((info) => {
      if (info.status === 'available') {
        setUpdateInfo({ version: info.version || '', ready: false })
      } else if (info.status === 'downloaded') {
        setUpdateInfo({ version: info.version || '', ready: true })
        setNotice(`Yeni sürüm hazır (${info.version}). Yüklemek için uygulama yeniden başlayacak.`, {
          label: 'Şimdi yükle',
          run: () => window.iptv.updater.quitAndInstall()
        })
      } else if (info.status === 'error') {
        // Otomatik indirme/kurulum bir sebeple başarısız oldu (ör. Mac'te
        // imzasız paket) — kullanıcı en azından sürüm sayfasından elle
        // indirebilsin diye bir seçenek bırakıyoruz.
        setUpdateInfo((cur) => cur ?? { version: '', ready: false })
      }
    })
  }, [])

  function checkForUpdateNow(): void {
    setNotice('Güncelleme kontrol ediliyor…')
    window.iptv.updater
      ?.checkNow()
      .then((res) => {
        if (!res.ok) {
          setNotice('Güncelleme kontrol edilemedi. İnternet bağlantını kontrol et.', {
            label: 'Sürüm sayfasını aç',
            run: () => window.iptv.updater.openReleasePage()
          })
        } else if (!res.version) {
          setNotice('Uygulama güncel.')
        }
        // res.version varsa 'available'/'downloaded' olayı zaten gelecek
      })
      .catch(() => {
        setNotice('Güncelleme kontrol edilemedi.')
      })
  }

  // ⌘K / Ctrl+K: her yerde ara. ⌘1-4 / Ctrl+1-4: sekmeler arası hızlı geçiş.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen(true)
        return
      }
      const tabs: ViewKey[] = ['live', 'vod', 'series', 'guide']
      const idx = Number(e.key) - 1
      if (idx >= 0 && idx < tabs.length) {
        e.preventDefault()
        changeView(tabs[idx])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Kanal numarasıyla geçiş: Canlı TV'deyken rakam tuşlarına basınca (TV
  // kumandası gibi) yazılan sayıya karşılık gelen sıradaki kanala atlanır.
  const [channelBuffer, setChannelBuffer] = useState('')
  const channelBufferTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const anyOverlayOpen =
      searchOpen || showManageSources || showParentalLock || showEpgGrid || showSettings || !!editSection
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (view !== 'live' || anyOverlayOpen) return
      if (!/^[0-9]$/.test(e.key)) return
      const tag = (document.activeElement as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      e.preventDefault()
      setChannelBuffer((prev) => {
        const next = (prev + e.key).slice(-3)
        if (channelBufferTimer.current) clearTimeout(channelBufferTimer.current)
        channelBufferTimer.current = setTimeout(() => {
          const target = unlockedChannels[Number(next) - 1]
          if (target) playChannel(target)
          setChannelBuffer('')
        }, 1100)
        return next
      })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, unlockedChannels, searchOpen, showManageSources, showParentalLock, showEpgGrid, showSettings, editSection])

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

  function openChannelMenu(item: ListableItem, x: number, y: number): void {
    const channel = channels.find((c) => c.id === item.id)
    if (channel) setChannelMenu({ channel, x, y })
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

  // Sekme değişince (varsa) tarayıcının kendi View Transitions API'siyle
  // yumuşak bir geçiş yapılır — hiçbir bileşen yeniden kurulmadığı için
  // oynatıcı/kaydırma konumu gibi durumlar bozulmuyor, sadece görsel bir
  // capraz geçiş oluyor.
  function changeView(next: ViewKey): void {
    const withTransition = (document as { startViewTransition?: (cb: () => void) => void })
      .startViewTransition
    if (withTransition) {
      withTransition.call(document, () => flushSync(() => setView(next)))
    } else {
      setView(next)
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

  function changePosterSize(next: PosterSize): void {
    setPosterSize(next)
    applyPosterSize(next)
    savePosterSize(next)
  }

  function changePosterShape(next: PosterShape): void {
    setPosterShape(next)
    savePosterShape(next)
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

  function setNotice(text: string | null, action?: NoticeAction): void {
    setNoticeState(text ? { text, action } : null)
  }

  // Favorilerden çıkarma yanlışlıkla olabiliyor; "Geri al" ile hem favoriye
  // hem de (varsa) bulunduğu klasör(ler)e geri koyuyoruz.
  function toggleFavoriteWithUndo(channelId: string): void {
    const wasFavorite = favoriteIds.has(channelId)
    const priorFolderIds = wasFavorite ? folders.filter((f) => f.channelIds.includes(channelId)).map((f) => f.id) : []
    const name = channels.find((c) => c.id === channelId)?.name || 'Kanal'
    toggleFavorite(channelId)
    if (wasFavorite) {
      setNotice(`“${name}” favorilerden çıkarıldı.`, {
        label: 'Geri al',
        run: () => {
          toggleFavorite(channelId)
          for (const folderId of priorFolderIds) favorites.toggleInFolder(folderId, channelId)
        }
      })
    }
  }

  // Kaynak silme geri alınamaz bir işlemdi ve önceden onay bile sormuyordu.
  function removeSourceWithUndo(id: string): void {
    const cfg = sources.find((s) => s.id === id)
    removeSource(id)
    if (cfg) {
      setNotice(`“${cfg.name}” kaynağı silindi.`, { label: 'Geri al', run: () => addSource(cfg) })
    }
  }

  // ----- Rehber: izle, hatırlat, arşivden izle -----
  function tuneChannelById(channelId: string): void {
    const ch = channelsRef.current.find((c) => c.id === channelId)
    if (!ch) return
    changeView('live')
    playChannel(ch)
  }

  function toggleReminderFor(
    ch: { channelId: string; streamId?: number; name: string; logo?: string },
    p: EpgProgram
  ): void {
    const was = reminders.has(ch.channelId, p.start)
    reminders.toggle({
      channelId: ch.channelId,
      streamId: ch.streamId,
      channelName: ch.name,
      logo: ch.logo,
      title: p.title,
      start: p.start,
      end: p.end
    })
    setNotice(
      was
        ? `“${p.title}” hatırlatıcısı kaldırıldı.`
        : `“${p.title}” başlamadan 5 dakika önce haber vereceğim (uygulama açık olmalı).`
    )
  }

  function fireReminder(r: Reminder): void {
    const mins = Math.max(0, Math.round((r.start - Date.now()) / 60000))
    const when = mins > 0 ? `${mins} dakika sonra` : 'şimdi'
    const text = `${r.title} — ${r.channelName} kanalında ${when} başlıyor.`
    try {
      const n = new Notification('IPTV Toto · Hatırlatma', { body: text })
      n.onclick = () => {
        window.iptv.window.focus()
        tuneChannelById(r.channelId)
      }
    } catch {
      /* sistem bildirimi gösterilemedi; uygulama içi bildirim yeterli */
    }
    setNotice(text, { label: 'Kanala geç', run: () => tuneChannelById(r.channelId) })
  }

  function watchArchive(streamId: number, p: EpgProgram): void {
    const ch = channelByStream.get(streamId)
    if (!ch || activeSource?.type !== 'xtream') return
    playFromBrowser({
      id: `archive-${streamId}-${p.start}`,
      name: `${ch.name} · ${p.title}`,
      group: ch.group,
      url: getTimeshiftUrl(activeSource, streamId, p.start, p.end),
      isLive: false,
      logo: ch.logo,
      kind: 'recording'
    })
  }

  // ----- Çoklu ekran -----
  async function openMultiView(): Promise<void> {
    if (activeRecording) {
      setNotice('Kayıt sürerken çoklu ekran açılamaz (hesabın bağlantısı kayıtta kullanılıyor).')
      return
    }
    const start = playing?.isLive ? (channels.find((c) => c.id === playing.id) ?? null) : null
    let maxSlots: number | null = null
    if (activeSource?.type === 'xtream') {
      maxSlots = (await getAccountInfo(activeSource).catch(() => ({ maxConnections: undefined }))).maxConnections ?? null
    }
    const resume = playing
    // Ana oynatıcı durur: ekranlar hesabın bağlantılarını kullanacak
    setTheater(false)
    setPlaying(null)
    setMultiView({ start, maxSlots, resume })
  }

  function closeMultiView(): void {
    const resume = multiView?.resume ?? null
    setMultiView(null)
    if (resume?.isLive) setPlaying(resume)
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

  // Sağ tık menüsünden: izlenmiyor olsa bile herhangi bir kanalı kaydet
  async function quickRecordChannel(channel: Channel, minutes = 60): Promise<void> {
    const now = Date.now()
    const end = now + minutes * 60_000
    const res = await window.iptv.recordings.schedule({
      title: channel.name,
      channelName: channel.name,
      channelId: channel.id,
      logo: channel.logo,
      url: channel.url,
      start: now,
      end
    })
    setNotice(
      res.ok
        ? `“${channel.name}” kaydı başladı — saat ${formatClock(end)} olunca bitecek.`
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
        changeView('live')
        playChannel(ch)
      }
      return
    }
    changeView(kind)
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
  const isMediaView =
    view === 'vod' ||
    view === 'series' ||
    view === 'recordings' ||
    view === 'guide' ||
    view === 'watchlist' ||
    view === 'stats' ||
    (view === 'live' && liveLayout === 'showcase')
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
        <EmptyIllustration kind="source" />
        <h3>Henüz bir kaynak eklemedin</h3>
        <p>Başlamak için bir M3U linki ya da Xtream Codes hesabı ekle.</p>
        <button className="btn-primary" onClick={() => setShowManageSources(true)}>
          + Kaynak Ekle
        </button>
      </div>
    )
  } else if (view === 'live' && liveLayout === 'classic') {
    if (loading && channels.length === 0) {
      leftArea = (
        <div className="pane pane-wide">
          <SkeletonChannelList />
        </div>
      )
    } else if (error && channels.length === 0) {
      leftArea = (
        <div className="pane pane-wide">
          <div className="empty-state">
            <h3>Sunucuya bağlanılamadı</h3>
            <p>{error}</p>
            <p>30 saniye içinde kendiliğinden tekrar denenecek.</p>
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
            onToggleFavorite={toggleFavoriteWithUndo}
            onContextMenu={openChannelMenu}
            getMeta={getLiveMeta}
            emptyIcon="search"
            emptyTitle="Canlı kanal bulunamadı"
            emptyHint={liveStatus === 'ready' ? 'Bu kaynakta canlı yayın listesi yok.' : ''}
            viewMode={listView}
            onViewModeChange={changeListView}
            headerAction={
              <>
                {activeSource?.type === 'xtream' && (
                  <button
                    className="icon-btn"
                    onClick={() => setShowEpgGrid(true)}
                    title="TV rehberi: kanalların program akışı"
                  >
                    <IconGuide size={15} />
                  </button>
                )}
                <button
                  className="icon-btn"
                  onClick={() => void openMultiView()}
                  title="Çoklu ekran: 2–4 kanalı aynı anda izle"
                >
                  <IconGrid size={15} />
                </button>
                <button
                  className="icon-btn"
                  onClick={() => setLiveLayout('showcase')}
                  title="Vitrin görünümüne geç"
                >
                  <IconLiveTv size={15} />
                </button>
              </>
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
          onToggleFavorite={toggleFavoriteWithUndo}
          onContextMenu={openChannelMenu}
          onReorder={activeFolder ? undefined : favorites.reorderFavorites}
          getMeta={getLiveMeta}
          emptyIcon={activeFolder ? 'folder' : 'favorite'}
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
  } else if (view === 'watchlist') {
    leftArea = (
      <WatchlistView
        isLocked={isLocked}
        onOpen={(e) => {
          changeView(e.kind)
          setMediaOpen({ kind: e.kind, id: e.id, nonce: Date.now() })
        }}
        onRemove={(id) => watchlistStore.set(watchlistStore.get().filter((x) => x.id !== id))}
      />
    )
  } else if (view === 'stats') {
    leftArea = <StatsView />
  } else if (view === 'guide') {
    leftArea = (
      <GuideView
        index={epgIndex}
        favoriteIds={favoriteIds}
        isLocked={isLocked}
        reminders={reminders.reminders}
        isReminded={reminders.has}
        onToggleReminder={(ch: IndexedChannel, p) => toggleReminderFor(ch, p)}
        onRemoveReminder={reminders.remove}
        onWatch={tuneChannelById}
        onRecord={(ch, p) => recordProgram(ch.streamId, p)}
      />
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
    <div className={`app-shell ${mediaKind ? 'is-media-view' : ''}`}>
      <TopNav
        view={view}
        onViewChange={changeView}
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
        posterSize={posterSize}
        onPosterSizeChange={changePosterSize}
        posterShape={posterShape}
        onPosterShapeChange={changePosterShape}
        updateInfo={updateInfo}
        onInstallUpdate={() => window.iptv.updater.quitAndInstall()}
        onCheckUpdate={checkForUpdateNow}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenSettings={() => setShowSettings(true)}
        recordingActive={!!activeRecording}
      />

      <div className="app-body">
        {/* Çocukların SIRASI sabit tutuluyor: oynatıcı her zaman son sırada,
            böylece sekme değişse de React onu yeniden kurmuyor ve yayın
            kesilmiyor. Görünüşü (yan panel / köşe / tam sayfa) CSS ile değişir. */}
        <div className={`main-area view-${view}`}>
          {leftArea}
          {!noSourceYet && view === 'live' && liveLayout === 'showcase' ? (
            loading && channels.length === 0 ? (
              <div className="pane pane-wide">
                <SkeletonChannelList />
              </div>
            ) : error && channels.length === 0 ? (
              <div className="pane pane-wide">
                <div className="empty-state">
                  <h3>Sunucuya bağlanılamadı</h3>
                  <p>{error}</p>
                  <p>30 saniye içinde kendiliğinden tekrar denenecek.</p>
                  <button className="btn-primary" onClick={reload}>
                    Tekrar Dene
                  </button>
                </div>
              </div>
            ) : (
              <LiveShowcase
                channels={liveChannels}
                categoryOrder={liveOrder}
                lockedGroups={lockApi.lockedGroups}
                isLocked={lockApi.isLocked}
                guard={guardedAction}
                favoriteIds={favoriteIds}
                onToggleFavorite={toggleFavoriteWithUndo}
                onSelect={playChannel}
                selectedId={playing?.id}
                getMeta={getLiveMeta}
                onOpenGuide={activeSource?.type === 'xtream' ? () => setShowEpgGrid(true) : undefined}
                onOpenMultiView={() => void openMultiView()}
                onEditCategories={() => setEditSection('live')}
                onSwitchClassic={() => setLiveLayout('classic')}
              />
            )
          ) : null}
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
              posterSize={posterSize}
              posterShape={posterShape}
            />
          ) : null}
          <div key="player-host" className={`player-host host-${hostMode}`}>
            <PlayerPane
              item={playing}
              source={activeSource}
              mode={compact || hostMode === 'hidden' ? 'docked' : hostMode}
              isFavorite={!!playing && favoriteIds.has(playing.id)}
              onToggleFavorite={playing?.isLive ? () => toggleFavoriteWithUndo(playing.id) : undefined}
              onClose={hostMode === 'theater' ? closeTheater : () => setPlaying(null)}
              onExpand={() => changeView('live')}
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
              onOpenMultiView={playing?.isLive ? () => void openMultiView() : undefined}
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
          onRemove={removeSourceWithUndo}
        />
      )}

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}

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
          isReminded={(streamId, start) => {
            const ch = channelByStream.get(streamId)
            return !!ch && reminders.has(ch.id, start)
          }}
          onToggleReminder={(streamId, p) => {
            const ch = channelByStream.get(streamId)
            if (ch) toggleReminderFor({ channelId: ch.id, streamId, name: ch.name, logo: ch.logo }, p)
          }}
          onWatchArchive={watchArchive}
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
          onHideAll={() => categoryPrefs.hideAll(editSection, editorGroups.map((g) => g.name))}
          onShowAll={() => categoryPrefs.showAll(editSection)}
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
          programs={programHits}
          isReminded={reminders.has}
          onToggleReminder={(ch, p) => toggleReminderFor(ch, p)}
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

      {multiView && (
        <MultiView
          channels={unlockedChannels}
          favorites={favoriteChannels.filter((c) => !isLocked(c.group))}
          start={multiView.start}
          maxSlots={multiView.maxSlots}
          onClose={closeMultiView}
        />
      )}

      <GlobalTooltip />

      {notice && (
        <div className="app-notice" onClick={() => setNoticeState(null)}>
          <span>{notice.text}</span>
          {notice.action && (
            <button
              className="app-notice-action"
              onClick={(e) => {
                e.stopPropagation()
                notice.action!.run()
                setNoticeState(null)
              }}
            >
              {notice.action.label}
            </button>
          )}
        </div>
      )}

      {channelMenu && (
        <ContextMenu
          x={channelMenu.x}
          y={channelMenu.y}
          onClose={() => setChannelMenu(null)}
          items={[
            {
              label: favoriteIds.has(channelMenu.channel.id) ? 'Favorilerden çıkar' : 'Favorilere ekle',
              icon: <IconStar size={14} filled={favoriteIds.has(channelMenu.channel.id)} />,
              onClick: () => toggleFavoriteWithUndo(channelMenu.channel.id)
            },
            {
              label: '1 saat kaydet',
              icon: <IconRecord size={14} />,
              onClick: () => void quickRecordChannel(channelMenu.channel, 60)
            }
          ]}
        />
      )}
    </div>
  )
}

export default App
