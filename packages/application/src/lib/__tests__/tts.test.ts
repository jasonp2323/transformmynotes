import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  audioErrorMessage,
  DEFAULT_VOICE_ID,
  getStoredVoiceId,
  isValidVoiceId,
  setStoredVoiceId,
  TTS_VOICE_STORAGE_KEY,
  TTS_VOICES,
} from '../tts';

describe('isValidVoiceId', () => {
  it('is true for the three known voice ids', () => {
    expect(isValidVoiceId('Camila')).toBe(true);
    expect(isValidVoiceId('Vitoria')).toBe(true);
    expect(isValidVoiceId('Thiago')).toBe(true);
  });

  it('is false for accented/unknown/empty values', () => {
    expect(isValidVoiceId('vitória')).toBe(false);
    expect(isValidVoiceId('foo')).toBe(false);
    expect(isValidVoiceId('')).toBe(false);
  });
});

describe('audioErrorMessage', () => {
  it('maps a 400 "too long" error to the length message', () => {
    expect(audioErrorMessage(400, 'Text too long to play.')).toBe('Text too long to play.');
  });

  it('maps 429 to the daily limit message', () => {
    expect(audioErrorMessage(429, 'daily_limit_reached')).toBe('Daily audio limit reached.');
  });

  it('falls back to the generic message for a 500', () => {
    expect(audioErrorMessage(500, undefined)).toBe('Audio unavailable.');
  });

  it('falls back to the generic message for a 400 without "too long"', () => {
    expect(audioErrorMessage(400, undefined)).toBe('Audio unavailable.');
  });
});

describe('TTS_VOICES', () => {
  it('has three entries', () => {
    expect(TTS_VOICES).toHaveLength(3);
  });

  it("displays Vitória's accent while keeping the id unaccented", () => {
    const vitoria = TTS_VOICES.find((v) => v.id === 'Vitoria');
    expect(vitoria).toBeDefined();
    expect(vitoria?.label).toBe('Vitória');
    expect(vitoria?.id).toBe('Vitoria');
  });

  it('defaults to Camila', () => {
    expect(DEFAULT_VOICE_ID).toBe('Camila');
  });
});

describe('getStoredVoiceId / setStoredVoiceId', () => {
  const originalWindow = (globalThis as Record<string, unknown>).window;
  const originalLocalStorage = (globalThis as Record<string, unknown>).localStorage;

  beforeEach(() => {
    const store = new Map<string, string>();
    const localStorageStub = {
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
    };
    (globalThis as Record<string, unknown>).localStorage = localStorageStub;
    (globalThis as Record<string, unknown>).window = globalThis;
  });

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as Record<string, unknown>).window;
    } else {
      (globalThis as Record<string, unknown>).window = originalWindow;
    }
    if (originalLocalStorage === undefined) {
      delete (globalThis as Record<string, unknown>).localStorage;
    } else {
      (globalThis as Record<string, unknown>).localStorage = originalLocalStorage;
    }
  });

  it('round-trips a valid voice id', () => {
    setStoredVoiceId('Thiago');
    expect(getStoredVoiceId()).toBe('Thiago');
  });

  it('returns undefined when the stored value is invalid', () => {
    localStorage.setItem(TTS_VOICE_STORAGE_KEY, 'bogus');
    expect(getStoredVoiceId()).toBeUndefined();
  });

  it('returns undefined when nothing is stored', () => {
    expect(getStoredVoiceId()).toBeUndefined();
  });
});
