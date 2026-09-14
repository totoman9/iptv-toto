// Görsel dosyaları (ör. logo.svg) içe aktarılınca adresini verir
declare module '*.svg' {
  const src: string
  export default src
}
