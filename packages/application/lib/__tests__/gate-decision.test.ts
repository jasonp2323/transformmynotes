import { describe, it, expect } from 'vitest';
import { gateDecision } from '../gate-decision';

describe('gateDecision', () => {
  it('active non-admin → allow', () => {
    expect(gateDecision('active', false)).toBe('allow');
  });

  it('active admin → allow', () => {
    expect(gateDecision('active', true)).toBe('allow');
  });

  it('null + admin → provision-admin', () => {
    expect(gateDecision(null, true)).toBe('provision-admin');
  });

  it('null + non-admin → pending', () => {
    expect(gateDecision(null, false)).toBe('pending');
  });

  it('pending status + admin → provision-admin', () => {
    expect(gateDecision('pending', true)).toBe('provision-admin');
  });

  it('disabled status + non-admin → pending', () => {
    expect(gateDecision('disabled', false)).toBe('pending');
  });
});
