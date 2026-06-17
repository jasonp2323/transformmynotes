import { describe, it, expect } from 'vitest';
import { audioHash } from '../../src/tts/hash';

describe('audioHash', () => {
  it('is deterministic: same inputs produce identical output', () => {
    const a = audioHash('Olá mundo', 'Camila', 'neural', 'slow');
    const b = audioHash('Olá mundo', 'Camila', 'neural', 'slow');
    expect(a).toBe(b);
  });

  it('returns a lowercase 64-char hex string (sha256)', () => {
    const h = audioHash('texto', 'Camila', 'neural');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).toHaveLength(64);
  });

  it('produces a different hash when voiceId differs', () => {
    const a = audioHash('texto', 'Camila', 'neural', 'slow');
    const b = audioHash('texto', 'Vitoria', 'neural', 'slow');
    expect(a).not.toBe(b);
  });

  it('produces a different hash when ssmlRate differs', () => {
    const a = audioHash('texto', 'Camila', 'neural', 'slow');
    const b = audioHash('texto', 'Camila', 'neural', 'fast');
    expect(a).not.toBe(b);
  });

  it('produces a different hash when text differs', () => {
    const a = audioHash('texto um', 'Camila', 'neural');
    const b = audioHash('texto dois', 'Camila', 'neural');
    expect(a).not.toBe(b);
  });

  it('produces a different hash when engine differs', () => {
    const a = audioHash('texto', 'Camila', 'neural');
    const b = audioHash('texto', 'Camila', 'standard');
    expect(a).not.toBe(b);
  });

  it('treats undefined ssmlRate the same as empty-string ssmlRate (both map to "")', () => {
    const undef = audioHash('texto', 'Camila', 'neural');
    const empty = audioHash('texto', 'Camila', 'neural', '');
    expect(undef).toBe(empty);
  });

  it('uses the "|" separator so concatenation collisions are avoided', () => {
    // Without a separator, ('ab','c') and ('a','bc') would collide.
    const a = audioHash('ab', 'c', 'neural');
    const b = audioHash('a', 'bc', 'neural');
    expect(a).not.toBe(b);
  });
});
