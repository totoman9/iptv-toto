import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { Splash } from './components/Splash'
import { initProxy } from './lib/proxy'
import { initSettings } from './lib/settings'
import { initLibraryStores } from './lib/library'
import { channelQualityPrefs } from './lib/channelPrefs'
import { recentChannelsStore } from './lib/recentChannels'
import { applyAccent, applyPosterSize, applyTheme, loadAccent, loadPosterSize, loadTheme } from './lib/theme'
import './styles/global.css'
import './styles/player.css'
import './styles/media.css'
import './styles/features.css'
import './styles/themes.css'

// macOS'ta pencere trafik ışıkları (kapat/küçült/büyüt) içerik üzerine
// biniyor; onlara yer açmak için gövdeye bir sınıf ekliyoruz.
if (window.iptv?.platform === 'darwin') {
  document.body.classList.add('platform-mac')
} else {
  // Windows/Linux: pencere çerçevesiz; sağ üstte kendi küçült/büyüt/kapat
  // düğmelerimiz var, üst çubuğun sağına bunlar için yer açıyoruz.
  document.body.classList.add('platform-win')
}

// Ekranda yakalanmayan bir hata olursa (beyaz ekran, donma vb.) diske yazılsın
// — bir sorun olduğunda tek kanıt ekran görüntüsü olmasın.
window.addEventListener('error', (e) => {
  window.iptv?.log?.error('renderer:error', e.error?.stack || e.message || String(e))
})
window.addEventListener('unhandledrejection', (e) => {
  const reason = e.reason
  window.iptv?.log?.error(
    'renderer:unhandledrejection',
    reason instanceof Error ? reason.stack || reason.message : String(reason)
  )
})

// Tema, ilk çizimden önce uygulanır (açılışta beyaz yanıp sönmesin)
applyTheme(loadTheme())
applyAccent(loadAccent())
applyPosterSize(loadPosterSize())

// Mağazalar hazırlanana kadar boş/beyaz bir pencere görünmesin diye kısa
// bir açılış ekranı gösteriliyor (bkz. Splash.tsx). Hazırlık genelde çok
// hızlı bittiği için en az yarım saniye tutuyoruz — yoksa animasyon daha
// başlamadan (fark edilmeden) kesilip gidiyordu.
const root = ReactDOM.createRoot(document.getElementById('root')!)
root.render(<Splash />)

const MIN_SPLASH_MS = 500
const splashStart = performance.now()

// Yerel canlı yayın aktarıcısının portunu uygulama açılmadan önce al
// (oynatıcı motoru bunu senkron olarak kullanıyor).
Promise.all([
  initProxy(),
  initSettings(),
  initLibraryStores(),
  channelQualityPrefs.init(),
  recentChannelsStore.init()
]).finally(() => {
  const remaining = MIN_SPLASH_MS - (performance.now() - splashStart)
  setTimeout(
    () => {
      root.render(
        <React.StrictMode>
          <App />
        </React.StrictMode>
      )
    },
    Math.max(0, remaining)
  )
})
