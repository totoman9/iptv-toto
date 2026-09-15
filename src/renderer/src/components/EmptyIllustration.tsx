import type { ReactElement, ReactNode } from 'react'
import { IconBookmark, IconFolder, IconLiveTv, IconSearch, IconStar } from './Icons'

export type EmptyIllustrationKind = 'source' | 'favorite' | 'watchlist' | 'search' | 'folder'

const ICONS: Record<EmptyIllustrationKind, ReactNode> = {
  source: <IconLiveTv size={30} />,
  favorite: <IconStar size={30} />,
  watchlist: <IconBookmark size={30} />,
  search: <IconSearch size={30} />,
  folder: <IconFolder size={30} />
}

// Boş ekranlarda düz yazı yerine, tema rengiyle uyumlu yumuşak bir rozet
// içinde ilgili simge — "Henüz bir kaynak eklemedin" gibi ekranları biraz
// daha tasarlanmış hissettiriyor.
export function EmptyIllustration({ kind }: { kind: EmptyIllustrationKind }): ReactElement {
  return <div className="empty-illustration">{ICONS[kind]}</div>
}
