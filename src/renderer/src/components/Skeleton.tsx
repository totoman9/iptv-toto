import type { ReactElement } from 'react'

// Film/dizi listesi yüklenirken Netflix tarzı satırların iskeletini gösterir
// (düz "yükleniyor" yazısı yerine) — içerik gelince yerini gerçek kartlara
// bırakıyor.
export function SkeletonPosterRows({ rows = 3, cards = 6 }: { rows?: number; cards?: number }): ReactElement {
  return (
    <div className="skeleton-rows">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r}>
          <div className="skeleton skeleton-row-title" />
          <div className="skeleton-row-cards">
            {Array.from({ length: cards }).map((_, c) => (
              <div key={c} className="skeleton skeleton-poster" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// Kanal/liste görünümü yüklenirken satır iskeleti
export function SkeletonChannelList({ rows = 8 }: { rows?: number }): ReactElement {
  return (
    <div className="skeleton-channel-list">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton skeleton-channel-row" />
      ))}
    </div>
  )
}
