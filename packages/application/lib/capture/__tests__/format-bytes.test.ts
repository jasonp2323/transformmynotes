import { describe, it, expect } from 'vitest';
import { formatBytes } from '../format-bytes';

describe('formatBytes', () => {
  it('formats bytes under 1 KB', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(1023)).toBe('1023 B');
  });

  it('formats KB range', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('formats MB range', () => {
    expect(formatBytes(1400000)).toBe('1.3 MB');
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(8.2 * 1024 * 1024)).toBe('8.2 MB');
  });

  it('formats GB range', () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0 GB');
  });
});
