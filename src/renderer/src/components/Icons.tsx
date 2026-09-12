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

export function IconPlayCircle({ size, ...rest }: IconProps): ReactElement {
  return (
    <svg {...base(size)} {...rest}>
      <circle cx="12" cy="12" r="9" />
      <path d="M10.3 8.8 15.5 12l-5.2 3.2Z" fill="currentColor" stroke="none" />
    </svg>
  )
}
