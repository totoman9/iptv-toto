import { contextBridge, ipcRenderer } from 'electron'
import type {
  ClipResult,
  HttpResult,
  RecordingEntry,
  RecordingInput,
  RecordingScheduleResult,
  SubtitleResult,
  SubtitleSearchParams
} from '../shared/types'

const api = {
  platform: process.platform,
  store: {
    read: <T>(key: string): Promise<T | null> => ipcRenderer.invoke('store:read', key),
    write: (key: string, value: unknown): Promise<boolean> =>
      ipcRenderer.invoke('store:write', key, value)
  },
  cache: {
    read: <T>(key: string): Promise<T | null> => ipcRenderer.invoke('cache:read', key),
    write: (key: string, value: unknown): Promise<boolean> =>
      ipcRenderer.invoke('cache:write', key, value)
  },
  log: {
    // Ekranda yakalanmayan bir hata olursa ana sürece bildirip diske yazdırır
    error: (scope: string, message: string): void => ipcRenderer.send('log:error', scope, message),
    openFolder: (): Promise<void> => ipcRenderer.invoke('log:openFolder')
  },
  tray: {
    // Menü çubuğu/sistem tepsisi menüsünün doğru göstermesi için şu an ne
    // izlendiğini bildir (kanal/film adı yoksa gizlenir)
    updateStatus: (status: { title?: string; isLive?: boolean; isPlaying?: boolean }): void =>
      ipcRenderer.send('tray:updateStatus', status),
    onCommand: (cb: (command: 'playPause' | 'next' | 'prev') => void): (() => void) => {
      const handler = (_e: unknown, command: 'playPause' | 'next' | 'prev'): void => cb(command)
      ipcRenderer.on('tray:command', handler)
      return () => {
        ipcRenderer.removeListener('tray:command', handler)
      }
    }
  },
  updater: {
    quitAndInstall: (): void => ipcRenderer.invoke('updater:quitAndInstall') as unknown as void,
    onEvent: (cb: (info: { status: 'downloaded'; version: string }) => void): (() => void) => {
      const handler = (_e: unknown, info: { status: 'downloaded'; version: string }): void => cb(info)
      ipcRenderer.on('updater:event', handler)
      return () => {
        ipcRenderer.removeListener('updater:event', handler)
      }
    }
  },
  http: {
    fetchText: (url: string, options?: { timeoutMs?: number }): Promise<HttpResult<string>> =>
      ipcRenderer.invoke('http:fetchText', url, options),
    fetchJson: <T = unknown>(
      url: string,
      options?: { timeoutMs?: number }
    ): Promise<HttpResult<T>> => ipcRenderer.invoke('http:fetchJson', url, options)
  },
  proxy: {
    getPort: (): Promise<number> => ipcRenderer.invoke('proxy:getPort'),
    canRemux: (): Promise<boolean> => ipcRenderer.invoke('proxy:canRemux'),
    releaseLive: (): void => ipcRenderer.send('proxy:releaseLive'),
    liveInfo: (): Promise<{
      videoCodec?: string
      audioCodec?: string
      fps?: number
      bitrateKbps?: number
      outTimeSec?: number
      ringSec?: number
      queuedSec?: number
    }> => ipcRenderer.invoke('proxy:liveInfo')
  },
  window: {
    setCompact: (on: boolean): Promise<boolean> => ipcRenderer.invoke('window:setCompact', on),
    focus: (): void => ipcRenderer.send('window:focus'),
    // Windows/Linux'taki özel başlık çubuğu düğmeleri için (Mac'te kullanılmaz)
    minimize: (): void => ipcRenderer.send('window:minimize'),
    toggleMaximize: (): void => ipcRenderer.send('window:toggleMaximize'),
    close: (): void => ipcRenderer.send('window:close'),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized'),
    onMaximizedChange: (cb: (maximized: boolean) => void): (() => void) => {
      const handler = (_e: unknown, maximized: boolean): void => cb(maximized)
      ipcRenderer.on('window:maximized', handler)
      return () => {
        ipcRenderer.removeListener('window:maximized', handler)
      }
    }
  },
  media: {
    saveScreenshot: (bytes: Uint8Array, title: string): Promise<ClipResult> =>
      ipcRenderer.invoke('media:saveScreenshot', bytes, title),
    openTrailer: (arg: { id?: string; query?: string }): Promise<boolean> =>
      ipcRenderer.invoke('media:openTrailer', arg),
    capturePage: (
      rect: { x: number; y: number; width: number; height: number },
      title: string
    ): Promise<ClipResult> => ipcRenderer.invoke('media:capturePage', rect, title)
  },
  clips: {
    saveLive: (title: string, seconds?: number, latencySec?: number): Promise<ClipResult> =>
      ipcRenderer.invoke('clip:saveLive', title, seconds, latencySec),
    saveVod: (url: string, title: string, endSeconds: number, seconds?: number): Promise<ClipResult> =>
      ipcRenderer.invoke('clip:saveVod', url, title, endSeconds, seconds),
    saveBuffer: (bytes: Uint8Array, title: string): Promise<ClipResult> =>
      ipcRenderer.invoke('clip:saveBuffer', bytes, title)
  },
  shell: {
    showItem: (filePath: string): Promise<void> => ipcRenderer.invoke('shell:showItem', filePath)
  },
  subs: {
    getConfig: (): Promise<{ hasApiKey: boolean; username: string; hasPassword: boolean }> =>
      ipcRenderer.invoke('subs:getConfig'),
    saveConfig: (patch: {
      apiKey?: string
      username?: string
      password?: string
      clear?: boolean
    }): Promise<boolean> => ipcRenderer.invoke('subs:saveConfig', patch),
    test: (): Promise<{ ok: boolean; error?: string; remaining?: number }> => ipcRenderer.invoke('subs:test'),
    search: (
      params: SubtitleSearchParams
    ): Promise<{ ok: boolean; error?: string; items?: SubtitleResult[] }> =>
      ipcRenderer.invoke('subs:search', params),
    download: (fileId: number): Promise<{ ok: boolean; error?: string; vtt?: string; remaining?: number }> =>
      ipcRenderer.invoke('subs:download', fileId)
  },
  recordings: {
    list: (): Promise<RecordingEntry[]> => ipcRenderer.invoke('rec:list'),
    schedule: (input: RecordingInput): Promise<RecordingScheduleResult> =>
      ipcRenderer.invoke('rec:schedule', input),
    stop: (id: string): Promise<boolean> => ipcRenderer.invoke('rec:stop', id),
    remove: (id: string, deleteFile: boolean): Promise<boolean> =>
      ipcRenderer.invoke('rec:remove', id, deleteFile),
    openFolder: (): Promise<void> => ipcRenderer.invoke('rec:openFolder'),
    onChanged: (cb: () => void): (() => void) => {
      const handler = (): void => cb()
      ipcRenderer.on('rec:changed', handler)
      return () => {
        ipcRenderer.removeListener('rec:changed', handler)
      }
    }
  }
}

export type IptvApi = typeof api

contextBridge.exposeInMainWorld('iptv', api)
