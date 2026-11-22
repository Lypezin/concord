interface AttachedAudioEntry {
  key: string;
  track: MediaStreamTrack;
  audioElement: HTMLAudioElement;
  sourceNode: MediaStreamAudioSourceNode;
  gainNode: GainNode;
}

type SinkCapableAudioContext = AudioContext & {
  setSinkId?: (sinkId: string) => Promise<void>;
};

type SinkCapableAudioElement = HTMLAudioElement & {
  setSinkId?: (sinkId: string) => Promise<void>;
};

function clampGain(percent: number): number {
  if (!Number.isFinite(percent)) return 1;
  return Math.min(2, Math.max(0, percent / 100));
}

export class RemoteAudioEngine {
  private ctx: SinkCapableAudioContext | null = null;
  private masterGain: GainNode | null = null;
  private entries = new Map<string, AttachedAudioEntry>();
  private deafened = false;
  private outputDeviceId = 'default';

  private ensureContext(): { ctx: SinkCapableAudioContext; masterGain: GainNode } {
    if (!this.ctx) {
      const ctx = new AudioContext({ latencyHint: 'interactive' }) as SinkCapableAudioContext;
      const master = ctx.createGain();
      master.gain.value = this.deafened ? 0 : 1;
      master.connect(ctx.destination);
      this.ctx = ctx;
      this.masterGain = master;
      if (this.outputDeviceId && this.outputDeviceId !== 'default') {
        void ctx.setSinkId?.(this.outputDeviceId).catch(() => undefined);
      }
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => undefined);
    }
    return { ctx: this.ctx, masterGain: this.masterGain! };
  }

  attachTrack(key: string, track: MediaStreamTrack, volumePercent = 100): void {
    this.detachTrack(key);

    const { ctx, masterGain } = this.ensureContext();
    const stream = new MediaStream([track]);

    // Hidden muted <audio> keeps Chromium's remote WebRTC audio pipeline flowing (crbug 933677)
    const audioElement = document.createElement('audio');
    audioElement.srcObject = stream;
    audioElement.muted = true;
    audioElement.autoplay = true;
    if (this.outputDeviceId && this.outputDeviceId !== 'default') {
      void (audioElement as SinkCapableAudioElement)
        .setSinkId?.(this.outputDeviceId)
        .catch(() => undefined);
    }
    void audioElement.play().catch(() => undefined);

    const sourceNode = ctx.createMediaStreamSource(stream);
    const gainNode = ctx.createGain();
    gainNode.gain.value = clampGain(volumePercent);

    sourceNode.connect(gainNode);
    gainNode.connect(masterGain);

    this.entries.set(key, {
      key,
      track,
      audioElement,
      sourceNode,
      gainNode,
    });
  }

  detachTrack(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key);

    try {
      entry.sourceNode.disconnect();
    } catch {
      // ignore
    }
    try {
      entry.gainNode.disconnect();
    } catch {
      // ignore
    }
    try {
      entry.audioElement.pause();
      entry.audioElement.srcObject = null;
    } catch {
      // ignore
    }
  }

  setVolume(key: string, volumePercent: number): void {
    const entry = this.entries.get(key);
    if (!entry || !this.ctx) return;
    entry.gainNode.gain.setTargetAtTime(clampGain(volumePercent), this.ctx.currentTime, 0.015);
  }

  setDeafened(deafened: boolean): void {
    this.deafened = deafened;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(deafened ? 0 : 1, this.ctx.currentTime, 0.015);
    }
  }

  async setOutputDevice(deviceId: string): Promise<void> {
    this.outputDeviceId = deviceId || 'default';
    const sinkTarget = this.outputDeviceId === 'default' ? '' : this.outputDeviceId;

    if (this.ctx?.setSinkId) {
      try {
        await this.ctx.setSinkId(sinkTarget);
      } catch {
        // fallback ignored on unsupported drivers
      }
    }

    for (const entry of this.entries.values()) {
      const el = entry.audioElement as SinkCapableAudioElement;
      if (el.setSinkId) {
        void el.setSinkId(sinkTarget).catch(() => undefined);
      }
    }
  }

  destroy(): void {
    for (const key of Array.from(this.entries.keys())) {
      this.detachTrack(key);
    }
    if (this.ctx) {
      void this.ctx.close().catch(() => undefined);
      this.ctx = null;
      this.masterGain = null;
    }
  }
}
