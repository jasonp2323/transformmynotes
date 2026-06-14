import { describe, it, expect } from 'vitest';
import { isExternalUrl } from '../is-external-url';

describe('isExternalUrl', () => {
  // External URLs — should return true
  it('returns true for https://google.com', () => {
    expect(isExternalUrl('https://google.com')).toBe(true);
  });

  it('returns true for https://www.example.com/path', () => {
    expect(isExternalUrl('https://www.example.com/path')).toBe(true);
  });

  it('returns true for http://external.io', () => {
    expect(isExternalUrl('http://external.io')).toBe(true);
  });

  // Internal / allowed URLs — should return false
  it('returns false for https://transformmynotes.com', () => {
    expect(isExternalUrl('https://transformmynotes.com')).toBe(false);
  });

  it('returns false for https://app.transformmynotes.com/x', () => {
    expect(isExternalUrl('https://app.transformmynotes.com/x')).toBe(false);
  });

  it('returns false for https://www.transformmynotes.com', () => {
    expect(isExternalUrl('https://www.transformmynotes.com')).toBe(false);
  });

  it('returns false for a deeply nested subdomain', () => {
    expect(isExternalUrl('https://pr-5.pr.transformmynotes.com/page')).toBe(false);
  });

  // Relative / non-http hrefs — should return false
  it('returns false for relative path /dashboard', () => {
    expect(isExternalUrl('/dashboard')).toBe(false);
  });

  it('returns false for hash anchor #anchor', () => {
    expect(isExternalUrl('#anchor')).toBe(false);
  });

  it('returns false for relative path without leading slash', () => {
    expect(isExternalUrl('notes/123')).toBe(false);
  });

  it('returns false for mailto: link', () => {
    expect(isExternalUrl('mailto:hello@example.com')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isExternalUrl('')).toBe(false);
  });

  // Custom allowedHost
  it('respects a custom allowedHost', () => {
    expect(isExternalUrl('https://sub.myapp.io/page', 'myapp.io')).toBe(false);
    expect(isExternalUrl('https://other.com', 'myapp.io')).toBe(true);
  });
});
