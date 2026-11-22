import { loadRnnoise, RnnoiseWorkletNode } from '@sapphi-red/web-noise-suppressor';
import rnnoiseWasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url';
import rnnoiseSimdWasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url';
import rnnoiseWorkletUrl from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url';
import type { AudioProcessorOptions, Track, TrackProcessor } from 'livekit-client';

let cachedWasmPromise: Promise<ArrayBuffer> | null = null;
const loadedContexts = new WeakMap<AudioContext, Promise<void>>();

function getWasmBinary(): Promise<ArrayBuffer> {
  if (!cachedWasmPromise) {
    cachedWasmPromise = loadRnnoise({
      url: rnnoiseWasmUrl,
      simdUrl: rnnoiseSimdWasmUrl,
    }).catch((err) => {
      cachedWasmPromise = null;
      throw err;
    });
  }
  return cachedWasmPromise;
}

function ensureWorkletLoaded(ctx: AudioContext): Promise<void> {
  const existing = loadedContexts.get(ctx);
  if (existing) return existing;
  const promise = ctx.audioWorklet.addModule(rnnoiseWorkletUrl).catch((err) => {
    loadedContexts.delete(ctx);
    throw err;
  });
  loadedContexts.set(ctx, promise);
  return promise;
}

export class RNNoiseAudioProcessor
  implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions>
{
  name = 'concord-rnnoise';
  processedTrack?: MediaStreamTrack;

  private ownContext?: AudioContext;
  private sourceNode?: MediaStreamAudioSourceNode;
  private workletNode?: RnnoiseWorkletNode;
  private destinationNode?: MediaStreamAudioDestinationNode;
  private keepAliveGain?: GainNode;

  async init(opts: AudioProcessorOptions): Promise<void> {
    try {
      const targetContext =
        opts.audioContext?.sampleRate === 48000
          ? opts.audioContext
          : new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });

      if (targetContext !== opts.audioContext) {
        this.ownContext = targetContext;
      }

      if (targetContext.state === 'suspended') {
        await targetContext.resume().catch(() => undefined);
      }

      const [wasmBinary] = await Promise.all([
        getWasmBinary(),
        ensureWorkletLoaded(targetContext),
      ]);

      this.sourceNode = targetContext.createMediaStreamSource(new MediaStream([opts.track]));
      this.workletNode = new RnnoiseWorkletNode(targetContext, {
        maxChannels: 1,
        wasmBinary,
      });
      this.destinationNode = targetContext.createMediaStreamDestination();

      // Mantém o clock de áudio do Chromium puxando o AudioWorklet continuamente sem emitir som local
      this.keepAliveGain = targetContext.createGain();
      this.keepAliveGain.gain.value = 0;

      this.sourceNode.connect(this.workletNode);
      this.workletNode.connect(this.destinationNode);
      this.workletNode.connect(this.keepAliveGain);
      this.keepAliveGain.connect(targetContext.destination);

      const outputTrack = this.destinationNode.stream.getAudioTracks()[0];
      this.processedTrack = outputTrack ?? opts.track;
    } catch (err) {
      console.warn('[Concord] RNNoise indisponível, usando áudio direto:', err);
      await this.destroy();
      this.processedTrack = opts.track;
    }
  }

  async restart(opts: AudioProcessorOptions): Promise<void> {
    await this.destroy();
    await this.init(opts);
  }

  async destroy(): Promise<void> {
    try {
      this.sourceNode?.disconnect();
    } catch {
      // ignore
    }
    try {
      this.workletNode?.disconnect();
      this.workletNode?.destroy();
    } catch {
      // ignore
    }
    try {
      this.keepAliveGain?.disconnect();
    } catch {
      // ignore
    }
    try {
      this.destinationNode?.disconnect();
      for (const t of this.destinationNode?.stream.getTracks() ?? []) {
        t.stop();
      }
    } catch {
      // ignore
    }
    if (this.ownContext) {
      await this.ownContext.close().catch(() => undefined);
      this.ownContext = undefined;
    }

    this.sourceNode = undefined;
    this.workletNode = undefined;
    this.keepAliveGain = undefined;
    this.destinationNode = undefined;
    this.processedTrack = undefined;
  }
}
