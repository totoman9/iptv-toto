import { type ReactElement } from 'react'
import logoUrl from '../assets/logo.svg'

// Açılış ekranı: mağazalar hazırlanırken (bkz. main.tsx) boş/beyaz bir
// pencere yerine kısa süreliğine gösterilir. Logo hafifçe nabız gibi atıp
// üstündeki yayın dalgaları peş peşe parlıyor.
export function Splash(): ReactElement {
  return (
    <div className="splash">
      <div className="splash-logo-wrap">
        <img src={logoUrl} alt="" className="splash-logo" />
        <span className="splash-ring splash-ring-1" />
        <span className="splash-ring splash-ring-2" />
      </div>
      <div className="splash-name">IPTV Toto</div>
    </div>
  )
}
