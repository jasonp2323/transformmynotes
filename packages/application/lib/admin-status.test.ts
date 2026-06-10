import { describe, it, expect } from 'vitest';
import { STATUS_TONE, statusTone, statusLabel } from './admin-status';

describe('STATUS_TONE', () => {
  it('maps pending → warning', () => {
    expect(STATUS_TONE.pending).toBe('warning');
  });

  it('maps used → success', () => {
    expect(STATUS_TONE.used).toBe('success');
  });

  it('maps expired → neutral', () => {
    expect(STATUS_TONE.expired).toBe('neutral');
  });

  it('maps revoked → danger', () => {
    expect(STATUS_TONE.revoked).toBe('danger');
  });

  it('maps active → success', () => {
    expect(STATUS_TONE.active).toBe('success');
  });

  it('maps disabled → neutral', () => {
    expect(STATUS_TONE.disabled).toBe('neutral');
  });
});

describe('statusTone', () => {
  it('returns the correct tone for each known status', () => {
    expect(statusTone('pending')).toBe('warning');
    expect(statusTone('used')).toBe('success');
    expect(statusTone('expired')).toBe('neutral');
    expect(statusTone('revoked')).toBe('danger');
    expect(statusTone('active')).toBe('success');
    expect(statusTone('disabled')).toBe('neutral');
  });

  it('returns neutral for an unknown status', () => {
    expect(statusTone('unknown')).toBe('neutral');
    expect(statusTone('')).toBe('neutral');
    expect(statusTone('bogus-value')).toBe('neutral');
  });
});

describe('statusLabel', () => {
  it('capitalizes the first letter of known statuses', () => {
    expect(statusLabel('pending')).toBe('Pending');
    expect(statusLabel('used')).toBe('Used');
    expect(statusLabel('expired')).toBe('Expired');
    expect(statusLabel('revoked')).toBe('Revoked');
    expect(statusLabel('active')).toBe('Active');
    expect(statusLabel('disabled')).toBe('Disabled');
  });

  it('capitalizes the first letter of an arbitrary string', () => {
    expect(statusLabel('foo')).toBe('Foo');
    expect(statusLabel('helloWorld')).toBe('HelloWorld');
  });

  it('returns empty string for an empty input', () => {
    expect(statusLabel('')).toBe('');
  });
});
