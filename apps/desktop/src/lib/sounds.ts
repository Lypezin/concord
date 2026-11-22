let sharedCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtor) return null;
  if (!sharedCtx) {
    sharedCtx = new AudioCtor();
  }
  if (sharedCtx.state === 'suspended') {
    void sharedCtx.resume().catch(() => undefined);
  }
  return sharedCtx;
}

function playTone(
  freqs: Array<{ freq: number; delay: number; duration: number; type?: OscillatorType }>,
  volume = 0.055,
): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const base = ctx.currentTime;
    for (const step of freqs) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = step.type ?? 'sine';
      osc.frequency.setValueAtTime(step.freq, base + step.delay);

      gain.gain.setValueAtTime(0.001, base + step.delay);
      gain.gain.exponentialRampToValueAtTime(volume, base + step.delay + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, base + step.delay + step.duration);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(base + step.delay);
      osc.stop(base + step.delay + step.duration + 0.01);
    }
  } catch {
    // ignore audio playback restrictions
  }
}

export function playMessagePing(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.06, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.15);
  } catch {
    // ignore audio playback restrictions
  }
}

export function playJoinVoice(): void {
  playTone([
    { freq: 440, delay: 0, duration: 0.08 },
    { freq: 587.33, delay: 0.075, duration: 0.12 },
  ]);
}

export function playLeaveVoice(): void {
  playTone([
    { freq: 523.25, delay: 0, duration: 0.08 },
    { freq: 349.23, delay: 0.075, duration: 0.13 },
  ]);
}

export function playMuteToggle(muted: boolean): void {
  if (muted) {
    playTone([{ freq: 360, delay: 0, duration: 0.07 }], 0.04);
  } else {
    playTone([{ freq: 520, delay: 0, duration: 0.07 }], 0.04);
  }
}

export function playDeafenToggle(deafened: boolean): void {
  if (deafened) {
    playTone([
      { freq: 400, delay: 0, duration: 0.06 },
      { freq: 300, delay: 0.055, duration: 0.08 },
    ], 0.045);
  } else {
    playTone([
      { freq: 360, delay: 0, duration: 0.06 },
      { freq: 540, delay: 0.055, duration: 0.08 },
    ], 0.045);
  }
}

export function playStartStream(): void {
  playTone([
    { freq: 523.25, delay: 0, duration: 0.07 },
    { freq: 659.25, delay: 0.06, duration: 0.07 },
    { freq: 783.99, delay: 0.12, duration: 0.12 },
  ]);
}
