import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { List, useListRef, type RowComponentProps } from 'react-window'
import type { Channel } from '../../../shared/types'
import { ALL_GROUP } from './CategoryColumn'
import { IconClose } from './Icons'

// Tam ekranda sağdan açılan kanal listesi: tam ekrandan çıkmadan kategori
// seçip kanal değiştirmek için.
export interface ChannelDrawerData {
  channels: Channel[]
  groups: string[]
  activeGroup: string
  onGroupChange: (group: string) => void
  onPick: (channel: Channel) => void
}

interface RowProps {
  rows: Channel[]
  selectedId: string
  onPick: (channel: Channel) => void
}

function Row({ index, style, rows, selectedId, onPick }: RowComponentProps<RowProps>): ReactElement {
  const ch = rows[index]
  return (
    <div
      style={style}
      className={`drawer-row ${ch.id === selectedId ? 'active' : ''}`}
      onClick={() => onPick(ch)}
    >
      <span className="drawer-row-num">{index + 1}</span>
      <div className="drawer-row-logo">
        {ch.logo ? (
          <img src={ch.logo} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />
        ) : (
          <span>{ch.name.slice(0, 2).toUpperCase()}</span>
        )}
      </div>
      <span className="drawer-row-name">{ch.name}</span>
    </div>
  )
}

interface Props {
  data: ChannelDrawerData
  selectedId: string
  onClose: () => void
}

export function ChannelDrawer({ data, selectedId, onClose }: Props): ReactElement {
  const { channels, groups, activeGroup, onGroupChange, onPick } = data
  const [search, setSearch] = useState('')
  const listRef = useListRef(null)

  const rows = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr')
    return channels.filter(
      (c) =>
        (activeGroup === ALL_GROUP || c.group === activeGroup) &&
        (!q || c.name.toLocaleLowerCase('tr').includes(q))
    )
  }, [channels, activeGroup, search])

  // Açılınca ve kategori değişince oynayan kanalı ortaya getir
  useEffect(() => {
    const index = rows.findIndex((c) => c.id === selectedId)
    if (index >= 0) listRef.current?.scrollToRow({ index, align: 'center' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroup])

  return (
    <div className="channel-drawer" onDoubleClick={(e) => e.stopPropagation()}>
      <div className="channel-drawer-head">
        <span className="channel-drawer-title">Kanallar</span>
        <button className="icon-btn" onClick={onClose} title="Kapat (Esc)">
          <IconClose size={13} />
        </button>
      </div>
      <div className="channel-drawer-filters">
        <select value={activeGroup} onChange={(e) => onGroupChange(e.target.value)}>
          <option value={ALL_GROUP}>Tüm kanallar</option>
          {groups.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`${rows.length} kanalda ara`}
        />
      </div>
      <div className="channel-drawer-list">
        {rows.length === 0 ? (
          <div className="channel-drawer-empty">Kanal bulunamadı</div>
        ) : (
          <List
            listRef={listRef}
            rowComponent={Row}
            rowCount={rows.length}
            rowHeight={50}
            rowProps={{ rows, selectedId, onPick }}
          />
        )}
      </div>
    </div>
  )
}
