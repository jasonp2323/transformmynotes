import { describe, it, expect } from 'vitest';
import { PT_BR_VOICES, isPtBrVoiceId, resolveVoiceEngine } from '../../src/tts/voices';

describe('resolveVoiceEngine', () => {
  it('falls back to the default engine when the preferred one is unsupported (Ricardo + neural → standard)', () => {
    expect(resolveVoiceEngine('Ricardo', 'neural')).toBe('standard');
  });

  it('returns the default engine when no preference is given (Ricardo → standard)', () => {
    expect(resolveVoiceEngine('Ricardo')).toBe('standard');
  });

  it('honours a supported preferred engine (Thiago + neural → neural)', () => {
    expect(resolveVoiceEngine('Thiago', 'neural')).toBe('neural');
  });

  it('falls back to the default when the preference is unsupported (Thiago + standard → neural)', () => {
    expect(resolveVoiceEngine('Thiago', 'standard')).toBe('neural');
  });

  it('honours generative when supported (Camila + generative → generative)', () => {
    expect(resolveVoiceEngine('Camila', 'generative')).toBe('generative');
  });

  it('returns the default engine when no preference is given (Camila → neural)', () => {
    expect(resolveVoiceEngine('Camila')).toBe('neural');
  });

  it('honours a supported preferred engine (Vitoria + standard → standard)', () => {
    expect(resolveVoiceEngine('Vitoria', 'standard')).toBe('standard');
  });

  it('throws for an unknown voice id', () => {
    expect(() => resolveVoiceEngine('Nope')).toThrow();
  });
});

describe('isPtBrVoiceId', () => {
  it('is true for the four known voice ids', () => {
    expect(isPtBrVoiceId('Camila')).toBe(true);
    expect(isPtBrVoiceId('Vitoria')).toBe(true);
    expect(isPtBrVoiceId('Thiago')).toBe(true);
    expect(isPtBrVoiceId('Ricardo')).toBe(true);
  });

  it('is false for accented/unknown/empty values', () => {
    expect(isPtBrVoiceId('vitória')).toBe(false);
    expect(isPtBrVoiceId('Joanna')).toBe(false);
    expect(isPtBrVoiceId('')).toBe(false);
  });
});

describe('PT_BR_VOICES', () => {
  it('has four entries', () => {
    expect(PT_BR_VOICES).toHaveLength(4);
  });
});
