import type { ReactElement, SVGProps } from 'react'

// Sade çizgi (line) ikon seti — emoji yerine premium/tutarlı bir görünüm için.
// Hepsi currentColor kullanır, böylece metin rengini otomatik alır.

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function base(size = 17): Omit<SVGProps<SVGSVGElement>, 'children'> {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round'
  }
}

export function IconLiveTv({ size, ...rest }: IconProps): ReactElement {
  return (
    <svg {...base(size)} {...rest}>
      <rect x="2.5" y="6" width="19" height="13" rx="2.4" />
      <path d="M8 3.5 12 6l4-2.5" />
      <circle cx="7" cy="12.2" r="1.15" fill="currentColor" stroke="none" />
      <path d="M11 10.2h7.5M11 12.5h7.5M11 14.8h5" />
    </svg>
  )
}

export function IconMovie({ size, ...rest }: IconProps): ReactElement {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M3 8.2 5.3 4h2.4L5.4 8.2Z" />
      <path d="M8.6 8.2 10.9 4h2.4l-2.3 4.2Z" />
      <path d="M14.2 8.2 16.5 4h2.3l-2.3 4.2Z" />
      <rect x="3" y="8.2" width="18" height="11.8" rx="1.8" />
    </svg>
  )
}

export function IconSeries({ size, ...rest }: IconProps): ReactElement {
  return (
    <svg {...base(size)} {...rest}>
      <rect x="3" y="4.5" width="18" height="12" rx="1.8" />
      <path d="M8 20h8M12 16.5V20" />
      <path d="M9.8 7.7 14.5 10.4 9.8 13.1Z" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconStar({ filled, size, ...rest }: IconProps & { filled?: boolean }): ReactElement {
  return (
    <svg {...base(size)} fill={filled ? 'currentColor' : 'none'} {...rest}>
      <path d="m12 3.4 2.62 5.47 6.03.72-4.45 4.16 1.16 5.95L12 16.77l-5.36 2.93 1.16-5.95L3.35 9.6l6.03-.72Z" />
    </svg>
  )
}

export function IconSearch({ size, ...rest }: IconProps): ReactElement {
  return (
    <svg {...base(size)} {...rest}>
      <circle cx="10.8" cy="10.8" r="6.8" />
      <path d="m20 20-4.4-4.4" />
    </svg>
  )
}

export function IconRefresh({ size, ...rest }: IconProps): ReactElement {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M20 11a8 8 0 0 0-14.6-4.4M4 4v4.5h4.5" />
      <path d="M4 13a8 8 0 0 0 14.6 4.4M20 20v-4.5h-4.5" />
    </svg>
  )
}

export function IconPlus({ size, ...rest }: IconProps): ReactElement {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function IconExpand({ size, ...rest }: IconProps): ReactElement {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" />
    </svg>
  )
}

export function IconClose({ size, ...rest }: IconProps): ReactElement {
  return (
    <svg {...base(size)} {...rest}>
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  )
}

export function IconWarning({ size, ...rest }: IconProps): ReactElement {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M12 3.5 21.5 20h-19Z" />
      <path d="M12 9.5v4.2" />
      <circle cx="12" cy="16.8" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconPlay({ size, ...rest }: IconProps): ReactElement {
  return (
    <svg {...base(size)} fill="currentColor" stroke="none" {...rest}>
      <path d="M7.5 5.2v13.6a1 1 0 0 0 1.53.85l10.9-6.8a1 1 0 0 0 0-1.7l-10.9-6.8a1 1 0 0 0-1.53.85Z" />
    </svg>
  )
}

export function IconPause({ size, ...rest }: IconProps): ReactElement {
  return (
    <svg {...base(size)} fill="currentColor" stroke="none" {...rest}>
      <rect x="6.5" y="4.5" width="4" height="15" rx="1" />
      <rect x="13.5" y="4.5" width="4" height="15" rx="1" />
    </svg>
  )
}

export function IconVolume({ size, ...rest }: IconProps): ReactElement {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M4 9.5v5h3.6l4.9 3.9V5.6L7.6 9.5Z" fill="currentColor" stroke="none" />
      <path d="M16.2 8.3a5 5 0 0 1 0 7.4M18.8 5.8a8.8 8.8 0 0 1 0 12.4" />
    </svg>
  )
}

export function IconMute({ size, ...rest }: IconProps): ReactElement {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M4 9.5v5h3.6l4.9 3.9V5.6L7.6 9.5Z" fill="currentColor" stroke="none" />
      <path d="m15.5 10 4.5 4M20 10l-4.5 4" />
    </svg>
  )
}

export function IconSettings({ size, ...rest }: IconProps): ReactElement {
  return (
    <svg {...base(size)} {...rest}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.8v2.2M12 19v2.2M4.9 4.9l1.55 1.55M17.55 17.55 19.1 19.1M2.8 12h2.2M19 12h2.2M4.9 19.1l1.55-1.55M17.55 6.45 19.1 4.9" />
    </svg>
  )
}

export function IconEdit({ size, ...rest }: IconProps): ReactElement {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17Z" />
      <path d="m14 6.5 3 3" />
    </svg>
  )
}

export function IconTrash({ size, ...rest }: IconProps): ReactElement {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M5 7h14M9 7V4.8c0-.44.36-.8.8-.8h4.4c.44 0 .8.36.8.8V7M7 7l.9 12.2c.05.7.63 1.3 1.34 1.3h5.52c.7 0 1.29-.6 1.34-1.3L17 7" />
      <path d="M10.2 11v6M13.8 11v6" />
    </svg>
  )
}

export function IconInfo({ size, ...rest }: IconProps): ReactElement {
  return (
    <svg {...base(size)} {...rest}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 10.8v6" />
      <circle cx="12" cy="7.6" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconLock({ size, ...rest }: IconProps): ReactElement {
  return (
    <svg {...base(size)} {...rest}>
      <rect x="5" y="10.5" width="14" height="10" rx="2.2" />
      <path d="M8 10.5V7.2a4 4 0 0 1 8 0v3.3" />
      <circle cx="12" cy="15" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconUnlock({ size, ...rest }: IconProps): ReactElement {
  return (
    <svg {...base(size)} {...rest}>
      <rect x="5" y="10.5" width="14" height="10" rx="2.2" />
      <path d="M8 10.5V7.2a4 4 0 0 1 7.4-2.1" />
      <circle cx="12" cy="15" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconGuide({ size, ...rest }: IconProps): ReactElement {
  return (
    <svg {...base(size)} {...rest}>
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <path d="M3 9.5h18M8 4.5v-1.3M16 4.5v-1.3" />
      <path d="M6.5 13h4M6.5 16h7" />
    </svg>
  )
}

export function IconScissors({ size, ...rest }: IconProps): ReactElement {
  return (
    <svg {...base(size)} {...rest}>
      <circle cx="6.5" cy="7" r="2.6" />
      <circle cx="6.5" cy="17" r="2.6" />
      <path d="M8.6 8.6 19.5 18.5M8.6 15.4 19.5 5.5" />
    </svg>
  )
}

export function IconArrowLeft({ size, ...rest }: IconProps): ReactElement {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </svg>
  )
}

export function IconGrid({ size, ...rest }: IconProps): ReactElement {
  return (
    <svg {...base(size)} {...rest}>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.4" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.4" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.4" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.4" />
    </svg>
  )
}

export function IconList({ size, ...rest }: IconProps): ReactElement {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M9 6.5h11M9 12h11M9 17.5h11" />
      <circle cx="4.8" cy="6.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="4.8" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="4.8" cy="17.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconChevronRight({ size, ...rest }: IconProps): ReactElement {
  return (
    <svg {...base(size)} {...rest}>
      <path d="m9.5 6 6 6-6 6" />
    </svg>
  )
}

export function IconCheck({ size, ...rest }: IconProps): ReactElement {
  return (
    <svg {...base(size)} {...rest}>
      <path d="m5 12.5 4.3 4.3L19 7" />
    </svg>
  )
}

export function IconPlayCircle({ size, ...rest }: IconProps): ReactElement {
  return (
    <svg {...base(size)} {...rest}>
      <circle cx="12" cy="12" r="9" />
      <path d="M10.3 8.8 15.5 12l-5.2 3.2Z" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconSun({ size, ...rest }: IconProps): ReactElement {
  return (
    <svg {...base(size)} {...rest}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
    </svg>
  )
}

export function IconMoon({ size, ...rest }: IconProps): ReactElement {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
    </svg>
  )
}

export function IconSkipPrev({ size, ...rest }: IconProps): ReactElement {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M6 5v14" />
      <path d="M18 5.5v13L9 12Z" fill="currentColor" />
    </svg>
  )
}

export function IconSkipNext({ size, ...rest }: IconProps): ReactElement {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M18 5v14" />
      <path d="M6 5.5v13L15 12Z" fill="currentColor" />
    </svg>
  )
}

export function IconChannels({ size, ...rest }: IconProps): ReactElement {
  return (
    <svg {...base(size)} {...rest}>
      <rect x="3" y="4" width="18" height="16" rx="2.4" />
      <path d="M7 9h10M7 12.5h10M7 16h6" />
    </svg>
  )
}

export function IconRewind({ size, ...rest }: IconProps): ReactElement {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
      <path d="M3.5 4v4.5H8" />
      <text x="12" y="15.2" fontSize="7" fontWeight="700" textAnchor="middle" fill="currentColor" stroke="none">
        10
      </text>
    </svg>
  )
}

export function IconCamera({ size, ...rest }: IconProps): ReactElement {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M4 8h3l1.6-2.4h6.8L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13" r="3.4" />
    </svg>
  )
}

export function IconSliders({ size, ...rest }: IconProps): ReactElement {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" />
      <circle cx="15" cy="6" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="17" cy="18" r="2" />
    </svg>
  )
}

export function IconPip({ size, ...rest }: IconProps): ReactElement {
  return (
    <svg {...base(size)} {...rest}>
      <rect x="2.5" y="4.5" width="19" height="15" rx="2" />
      <rect x="12" y="11.5" width="7" height="5.5" rx="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconMiniWindow({ size, ...rest }: IconProps): ReactElement {
  return (
    <svg {...base(size)} {...rest}>
      <rect x="2.5" y="4.5" width="19" height="15" rx="2" />
      <path d="M14 10.5h4.5M18.5 10.5V6M18.5 6l-5 4.5" />
    </svg>
  )
}

export function IconKeyboard({ size, ...rest }: IconProps): ReactElement {
  return (
    <svg {...base(size)} {...rest}>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M7 14h10" />
    </svg>
  )
}
