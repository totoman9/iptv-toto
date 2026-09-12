import type { IptvApi } from './index'

declare global {
  interface Window {
    iptv: IptvApi
  }
}
