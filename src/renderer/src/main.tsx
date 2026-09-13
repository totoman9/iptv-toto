import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { initProxy } from './lib/proxy'
import { initSettings } from './lib/settings'
import { initLibraryStores } from './lib/library'
import { applyAccent, applyTheme, loadAccent, loadTheme } from './lib/theme'
import './styles/global.css'
import './styles/player.css'
import './styles/media.css'
import './styles/features.css'
import './styles/themes.css'

// macOS'ta pencere trafik ışıkları (kapat/küçült/büyüt) içerik üzerine
// biniyor; onlara yer açmak için gövdeye bir sınıf ekliyoruz.
if (window.iptv?.platform === 'darwin') {
  document.body.classList.add('platform-mac')
}

// Tema, ilk çizimden önce uygulanır (açılışta beyaz yanıp sönmesin)
applyTheme(loadTheme())
applyAccent(loadAccent())

// Yerel canlı yayın aktarıcısının portunu uygulama açılmadan önce al
// (oynatıcı motoru bunu senkron olarak kullanıyor).
Promise.all([initProxy(), initSettings(), initLibraryStores()]).finally(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
})
