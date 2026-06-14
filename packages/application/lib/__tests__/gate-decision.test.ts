import { describe, it, expect } from 'vitest';
import { gateDecision } from '../gate-decision';

describe('gateDecision', () => {
  it('active → allow', () => {
    expect(gateDecision('active')).toBe('allow');
  });

  it('disabled → blocked', () => {
    expect(gateDecision('disabled')).toBe('blocked');
  });

  it('pending → provision', () => {
    expect(gateDecision('pending')).toBe('provision');
  });

  it('null (no profile) → provision', () => {
    expect(gateDecision(null)).toBe('provision');
  });
});
