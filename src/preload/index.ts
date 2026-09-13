import { contextBridge, ipcRenderer } from 'electron'
import type { ClipResult, HttpResult } from '../shared/types'

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
    setCompact: (on: boolean): Promise<boolean> => ipcRenderer.invoke('window:setCompact', on)
  },
  media: {
    saveScreenshot: (bytes: Uint8Array, title: string): Promise<ClipResult> =>
      ipcRenderer.invoke('media:saveScreenshot', bytes, title),
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
  }
}

export type IptvApi = typeof api

contextBridge.exposeInMainWorld('iptv', api)
