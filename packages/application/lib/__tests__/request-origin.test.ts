import { describe, it, expect } from 'vitest';
import { originFromHeaders } from '../request-origin';

describe('originFromHeaders', () => {
  it('uses x-forwarded-proto and host when both present', () => {
    const headers = new Headers({
      'x-forwarded-proto': 'https',
      host: 'app.example.com',
    });
    expect(originFromHeaders(headers, 'https://fallback.example.com')).toBe(
      'https://app.example.com',
    );
  });

  it('defaults proto to https when x-forwarded-proto is missing', () => {
    const headers = new Headers({ host: 'app.example.com' });
    expect(originFromHeaders(headers, 'https://fallback.example.com')).toBe(
      'https://app.example.com',
    );
  });

  it('returns fallback when no host header is present', () => {
    const headers = new Headers({ 'x-forwarded-proto': 'https' });
    expect(originFromHeaders(headers, 'https://fallback.example.com')).toBe(
      'https://fallback.example.com',
    );
  });

  it('uses x-forwarded-host when host is missing', () => {
    const headers = new Headers({
      'x-forwarded-proto': 'http',
      'x-forwarded-host': 'app.pr-42.example.com',
    });
    expect(originFromHeaders(headers, 'https://fallback.example.com')).toBe(
      'http://app.pr-42.example.com',
    );
  });
});
