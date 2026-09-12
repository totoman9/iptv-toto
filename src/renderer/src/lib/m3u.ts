import type { Channel } from '../../../shared/types'

// #EXTINF satırından tvg-xxx="..." gibi öznitelikleri ayıklar
function parseAttributes(line: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const re = /([a-zA-Z0-9-]+)="([^"]*)"/g
  let match: RegExpExecArray | null
  while ((match = re.exec(line)) !== null) {
    attrs[match[1].toLowerCase()] = match[2]
  }
  return attrs
}

export function parseM3U(content: string): Channel[] {
  const lines = content.split(/\r?\n/)
  const channels: Channel[] = []
  let pending: { attrs: Record<string, string>; name: string } | null = null
  let index = 0

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    if (line.startsWith('#EXTINF')) {
      const commaIndex = line.indexOf(',')
      const attrsPart = commaIndex >= 0 ? line.slice(0, commaIndex) : line
      const name = commaIndex >= 0 ? line.slice(commaIndex + 1).trim() : 'Bilinmeyen Kanal'
      pending = { attrs: parseAttributes(attrsPart), name }
      continue
    }

    if (line.startsWith('#')) continue // diğer meta satırları (#EXTM3U, #EXTGRP vs.) atla

    // URL satırı
    if (pending) {
      index += 1
      channels.push({
        id: `m3u-${index}-${pending.attrs['tvg-id'] || line.slice(-24)}`,
        name: pending.name || `Kanal ${index}`,
        logo: pending.attrs['tvg-logo'],
        group: pending.attrs['group-title'] || 'Diğer',
        url: line,
        epgChannelId: pending.attrs['tvg-id'] || undefined
      })
      pending = null
    }
  }

  return channels
}
