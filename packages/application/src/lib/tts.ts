// Import from the dedicated `tts/voices` subpath, NOT the `@transformmynotes/core`
// barrel: this module is pulled into the client bundle (via VoiceSelector), and
// the barrel transitively imports `node:crypto` (access-requests.ts), which the
// client webpack build cannot resolve. `voices.ts` has only a type-only import,
// so the subpath is client-safe.
import { PT_BR_VOICES, isPtBrVoiceId, type PtBrVoiceId } from '@transformmynotes/core/tts/voices';

export const TTS_VOICE_STORAGE_KEY = 'tts.voiceId';

export type TtsVoiceId = PtBrVoiceId;

export interface TtsVoice {
  id: TtsVoiceId;
  label: string;
}

// `id` is the unaccented value the synthesize API accepts (note `Vitoria` has
// no accent); `label` is the accented display string shown in the UI.
export const TTS_VOICES: ReadonlyArray<TtsVoice> = PT_BR_VOICES.map((v) => ({ id: v.id, label: v.label }));

export const DEFAULT_VOICE_ID: TtsVoiceId = 'Camila';

export function isValidVoiceId(v: string): v is TtsVoiceId {
  return isPtBrVoiceId(v);
}

export function getStoredVoiceId(): TtsVoiceId | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const stored = localStorage.getItem(TTS_VOICE_STORAGE_KEY);
    if (stored && isValidVoiceId(stored)) return stored;
    return undefined;
  } catch {
    return undefined;
  }
}

export function setStoredVoiceId(id: TtsVoiceId): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(TTS_VOICE_STORAGE_KEY, id);
  } catch {
    // localStorage can throw (private mode, quota); ignore.
  }
}

export function audioErrorMessage(status: number, serverError?: string): string {
  if (status === 400 && serverError && serverError.includes('too long')) {
    return 'Text too long to play.';
  }
  if (status === 429) {
    return 'Daily audio limit reached.';
  }
  return 'Audio unavailable.';
}
