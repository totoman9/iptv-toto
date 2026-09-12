import { contextBridge, ipcRenderer } from 'electron'
import type { HttpResult } from '../shared/types'

const api = {
  platform: process.platform,
  store: {
    read: <T>(key: string): Promise<T | null> => ipcRenderer.invoke('store:read', key),
    write: (key: string, value: unknown): Promise<boolean> =>
      ipcRenderer.invoke('store:write', key, value)
  },
  http: {
    fetchText: (url: string, options?: { timeoutMs?: number }): Promise<HttpResult<string>> =>
      ipcRenderer.invoke('http:fetchText', url, options),
    fetchJson: <T = unknown>(
      url: string,
      options?: { timeoutMs?: number }
    ): Promise<HttpResult<T>> => ipcRenderer.invoke('http:fetchJson', url, options)
  }
}

export type IptvApi = typeof api

contextBridge.exposeInMainWorld('iptv', api)
