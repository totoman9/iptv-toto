// Ses seviyesi dengeleme: kanallar/reklamlar arasındaki ses farkını
// azaltmak için videonun sesini bir sıkıştırıcıdan (compressor) geçirir.
// Bir video elementine ses grafiği yalnızca bir kez bağlanabildiği için ilk
// açılışta kurulur, sonra sadece yönlendirme değiştirilir.

const KEY = 'iptv-toto-leveling'

let ctx: AudioContext | null = null
let source: MediaElementAudioSourceNode | null = null
let chainInput: AudioNode | null = null
let boundVideo: HTMLVideoElement | null = null

export function loadLeveling(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function saveLeveling(on: boolean): void {
  try {
    window.localStorage.setItem(KEY, on ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export function setVolumeLeveling(video: HTMLVideoElement, on: boolean): void {
  // Hiç açılmadıysa ses grafiğini kurmaya gerek yok
  if (!on && !ctx) return
  if (!ctx || boundVideo !== video) {
    ctx = new AudioContext()
    source = ctx.createMediaElementSource(video)
    boundVideo = video
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -26
    comp.knee.value = 24
    comp.ratio.value = 8
    comp.attack.value = 0.004
    comp.release.value = 0.3
    // Sıkıştırmayla düşen genel seviyeyi geri kazandır
    const makeup = ctx.createGain()
    makeup.gain.value = 1.7
    comp.connect(makeup)
    makeup.connect(ctx.destination)
    chainInput = comp
  }
  source!.disconnect()
  source!.connect(on ? chainInput! : ctx.destination)
  void ctx.resume()
}
