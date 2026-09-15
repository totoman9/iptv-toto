import type { ReactElement } from 'react'
import { usePersisted } from '../lib/persisted'
import { watchlistStore, type WatchlistEntry } from '../lib/library'
import { PosterCard } from './media/PosterCard'
import { IconClose } from './Icons'
import { EmptyIllustration } from './EmptyIllustration'

interface Props {
  isLocked: (group: string) => boolean
  onOpen: (entry: WatchlistEntry) => void
  onRemove: (id: string) => void
}

export function WatchlistView({ isLocked, onOpen, onRemove }: Props): ReactElement {
  const list = usePersisted(watchlistStore)
  const sections: { kind: 'vod' | 'series'; title: string }[] = [
    { kind: 'vod', title: 'Filmler' },
    { kind: 'series', title: 'Diziler' }
  ]

  return (
    <div className="library-view">
      <div className="media-toolbar">
        <div className="media-toolbar-title">İzleme listem</div>
        <span className="guide-status">{list.length} içerik</span>
      </div>
      <div className="library-scroll">
        {list.length === 0 ? (
          <div className="empty-state">
            <EmptyIllustration kind="watchlist" />
            <h3>İzleme listen boş</h3>
            <p>Bir film ya da dizinin sayfasında “Listeme ekle”ye bas; sonra izlemek istediklerin burada birikir.</p>
          </div>
        ) : (
          sections.map(({ kind, title }) => {
            const items = list.filter((e) => e.kind === kind)
            if (items.length === 0) return null
            return (
              <section key={kind} className="guide-section">
                <div className="guide-section-title">{title}</div>
                <div className="watchlist-grid">
                  {items.map((e) => (
                    <div key={e.id} className="watchlist-item">
                      <PosterCard
                        data={{ id: e.id, title: e.name, image: e.logo, locked: isLocked(e.group) }}
                        onClick={() => onOpen(e)}
                      />
                      <button className="watchlist-remove" onClick={() => onRemove(e.id)} title="Listeden çıkar">
                        <IconClose size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )
          })
        )}
      </div>
    </div>
  )
}
