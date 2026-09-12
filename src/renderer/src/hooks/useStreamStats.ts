import { useEffect, useRef, useState } from 'react'
import type { AttachedPlayer } from '../lib/playerEngine'

export interface StreamStats {
  width: number
  height: number
  fps: number
  bitrateKbps?: number
  videoCodec?: string
  audioCodec?: string
}

const EMPTY_STATS: StreamStats = { width: 0, height: 0, fps: 0 }

// Video elementinden gerçek zamanlı çözünürlük/FPS okur, oynatıcı motorundan
// (hls.js / mpegts.js) bitrate ve codec bilgisini alır.
export function useStreamStats(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  player: AttachedPlayer | null
): StreamStats {
  const [stats, setStats] = useState<StreamStats>(EMPTY_STATS)
  const frameCountRef = useRef(0)
  const lastSampleRef = useRef(performance.now())

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    frameCountRef.current = 0
    lastSampleRef.current = performance.now()

    let rafHandle: number | null = null
    let vfcHandle: number | null = null
    let cancelled = false

    const sampleTick = (): void => {
      const now = performance.now()
      const elapsed = now - lastSampleRef.current
      if (elapsed >= 1000) {
        const fps = Math.round((frameCountRef.current * 1000) / elapsed)
        frameCountRef.current = 0
        lastSampleRef.current = now
        const info = player?.getInfo() || {}
        setStats({
          width: video.videoWidth,
          height: video.videoHeight,
          fps,
          bitrateKbps: info.bitrateKbps,
          videoCodec: info.videoCodec,
          audioCodec: info.audioCodec
        })
      }
    }

    // requestVideoFrameCallback varsa gerçek render edilen kareleri sayar (en doğru yöntem)
    const hasVfc = 'requestVideoFrameCallback' in video
    if (hasVfc) {
      const onFrame = (): void => {
        if (cancelled) return
        frameCountRef.current += 1
        sampleTick()
        vfcHandle = (
          video as HTMLVideoElement & {
            requestVideoFrameCallback: (cb: () => void) => number
          }
        ).requestVideoFrameCallback(onFrame)
      }
      vfcHandle = (
        video as HTMLVideoElement & { requestVideoFrameCallback: (cb: () => void) => number }
      ).requestVideoFrameCallback(onFrame)
    } else {
      // Geri dönüş: rAF ile örnekleme (daha az kesin ama yeterli)
      const loop = (): void => {
        if (cancelled) return
        frameCountRef.current += 1
        sampleTick()
        rafHandle = requestAnimationFrame(loop)
      }
      rafHandle = requestAnimationFrame(loop)
    }

    return () => {
      cancelled = true
      if (rafHandle !== null) cancelAnimationFrame(rafHandle)
      if (vfcHandle !== null && hasVfc) {
        try {
          ;(
            video as HTMLVideoElement & { cancelVideoFrameCallback: (h: number) => void }
          ).cancelVideoFrameCallback(vfcHandle)
        } catch {
          /* ignore */
        }
      }
      setStats(EMPTY_STATS)
    }
  }, [videoRef, player])

  return stats
}
