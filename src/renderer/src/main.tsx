import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/global.css'

// macOS'ta pencere trafik ışıkları (kapat/küçült/büyüt) içerik üzerine
// biniyor; onlara yer açmak için gövdeye bir sınıf ekliyoruz.
if (window.iptv?.platform === 'darwin') {
  document.body.classList.add('platform-mac')
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
