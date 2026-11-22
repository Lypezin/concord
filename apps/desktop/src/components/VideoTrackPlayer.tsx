import { memo, useEffect, useRef } from 'react';
import type { Track } from 'livekit-client';

export interface VideoTrackPlayerProps {
  track: Track;
  className?: string;
  onStats?: (stats: { width: number; height: number; fps: number }) => void;
}

type FrameCallbackVideoElement = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number) => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

export const VideoTrackPlayer = memo(function VideoTrackPlayer({
  track,
  className,
  onStats,
}: VideoTrackPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const onStatsRef = useRef(onStats);

  useEffect(() => {
    onStatsRef.current = onStats;
  }, [onStats]);

  // IMPORTANTE: depende APENAS de `track`.
  // Nunca depender de `onStats` para não executar `track.detach(el)` + `track.attach(el)`
  // a cada re-render (o que fazia o vídeo piscar em preto a cada segundo ou ao falar no mic).
  useEffect(() => {
    const el = videoRef.current as FrameCallbackVideoElement | null;
    if (!el) return;

    track.attach(el);
    void el.play().catch(() => undefined);

    let frameCount = 0;
    let lastCheck = performance.now();
    let vfcHandle = 0;
    let fallbackTimer: ReturnType<typeof setInterval> | null = null;

    const emitCurrentStats = (measuredFps: number) => {
      const settings = track.mediaStreamTrack?.getSettings?.() ?? {};
      const w = el.videoWidth || settings.width || 0;
      const h = el.videoHeight || settings.height || 0;
      const fps =
        measuredFps > 0
          ? measuredFps
          : settings.frameRate
            ? Math.round(settings.frameRate)
            : 0;
      if (w > 0 && h > 0) {
        onStatsRef.current?.({ width: w, height: h, fps });
      }
    };

    const onFrame = (now: number) => {
      frameCount++;
      const elapsed = now - lastCheck;
      if (elapsed >= 1000) {
        const measuredFps = Math.round((frameCount * 1000) / elapsed);
        emitCurrentStats(measuredFps);
        frameCount = 0;
        lastCheck = now;
      }
      if (el.requestVideoFrameCallback) {
        vfcHandle = el.requestVideoFrameCallback(onFrame);
      }
    };

    if (el.requestVideoFrameCallback) {
      vfcHandle = el.requestVideoFrameCallback(onFrame);
    } else {
      fallbackTimer = setInterval(() => emitCurrentStats(0), 1500);
    }

    return () => {
      if (vfcHandle && el.cancelVideoFrameCallback) {
        el.cancelVideoFrameCallback(vfcHandle);
      }
      if (fallbackTimer) {
        clearInterval(fallbackTimer);
      }
      track.detach(el);
    };
  }, [track]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      disablePictureInPicture
      className={className}
    />
  );
});
