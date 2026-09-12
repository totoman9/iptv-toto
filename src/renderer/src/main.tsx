import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { initProxy } from './lib/proxy'
import './styles/global.css'
import './styles/player.css'
import './styles/media.css'

// macOS'ta pencere trafik ışıkları (kapat/küçült/büyüt) içerik üzerine
// biniyor; onlara yer açmak için gövdeye bir sınıf ekliyoruz.
if (window.iptv?.platform === 'darwin') {
  document.body.classList.add('platform-mac')
}

// Yerel canlı yayın aktarıcısının portunu uygulama açılmadan önce al
// (oynatıcı motoru bunu senkron olarak kullanıyor).
initProxy().finally(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
})
