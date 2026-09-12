# IPTV Stüdyo

Mac ve Windows için masaüstü IPTV oynatıcı. Mor temalı, modern arayüz.

## Neler var?

- **M3U link** veya **Xtream Codes** ile kanal listesi ekleme
- Canlı TV, Filmler, Diziler, Favoriler sekmeleri
- Kategori filtreleme ve arama
- Oynatıcıda **canlı yayın kalite bilgisi**: çözünürlük, FPS, bitrate, codec
- Canlı kanallarda **şimdi/sırada** TV rehberi (Xtream kaynaklarda)
- Birden fazla kaynak ekleyip aralarında geçiş yapabilme

## Geliştirme

```bash
npm install
npm run dev
```

## Paket oluşturma

```bash
npm run build:mac    # Mac için .dmg
npm run build:win    # Windows için .exe
```

## Notlar

- Uygulama, oynatıcının çoğu IPTV sunucusuyla uyumlu çalışması için
  `webSecurity` kısıtlamasını kapatır (yalnızca bu masaüstü uygulaması
  için geçerli, tarayıcı güvenliğini etkilemez).
- Diziler ve filmler yalnızca Xtream Codes kaynaklarında listelenir
  (M3U listeleri genelde sadece canlı kanal içerir).
