import type { ShortcutConfig } from '../bridge-types.js';

export interface VoiceAudioSettings {
  inputDeviceId: string;
  outputDeviceId: string;
  rnnoiseEnabled: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
  shortcuts: ShortcutConfig;
  userVolumes: Record<string, number>;
  streamVolumes: Record<string, number>;
}

const STORAGE_KEY = 'concord.voiceSettings.v1';

export const DEFAULT_VOICE_SETTINGS: VoiceAudioSettings = {
  inputDeviceId: 'default',
  outputDeviceId: 'default',
  rnnoiseEnabled: true,
  echoCancellation: true,
  autoGainControl: true,
  shortcuts: {
    toggleMute: 'CommandOrControl+Shift+M',
    toggleDeafen: 'CommandOrControl+Shift+D',
  },
  userVolumes: {},
  streamVolumes: {},
};

export function loadVoiceSettings(): VoiceAudioSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_VOICE_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<VoiceAudioSettings>;
    return {
      inputDeviceId:
        typeof parsed.inputDeviceId === 'string' && parsed.inputDeviceId
          ? parsed.inputDeviceId
          : 'default',
      outputDeviceId:
        typeof parsed.outputDeviceId === 'string' && parsed.outputDeviceId
          ? parsed.outputDeviceId
          : 'default',
      rnnoiseEnabled:
        typeof parsed.rnnoiseEnabled === 'boolean' ? parsed.rnnoiseEnabled : true,
      echoCancellation:
        typeof parsed.echoCancellation === 'boolean' ? parsed.echoCancellation : true,
      autoGainControl:
        typeof parsed.autoGainControl === 'boolean' ? parsed.autoGainControl : true,
      shortcuts: {
        toggleMute:
          typeof parsed.shortcuts?.toggleMute === 'string'
            ? parsed.shortcuts.toggleMute
            : DEFAULT_VOICE_SETTINGS.shortcuts.toggleMute,
        toggleDeafen:
          typeof parsed.shortcuts?.toggleDeafen === 'string'
            ? parsed.shortcuts.toggleDeafen
            : DEFAULT_VOICE_SETTINGS.shortcuts.toggleDeafen,
      },
      userVolumes:
        parsed.userVolumes && typeof parsed.userVolumes === 'object'
          ? parsed.userVolumes
          : {},
      streamVolumes:
        parsed.streamVolumes && typeof parsed.streamVolumes === 'object'
          ? parsed.streamVolumes
          : {},
    };
  } catch {
    return { ...DEFAULT_VOICE_SETTINGS };
  }
}

export function saveVoiceSettings(settings: VoiceAudioSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore storage errors
  }
}
