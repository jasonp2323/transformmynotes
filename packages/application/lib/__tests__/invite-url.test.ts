import { describe, it, expect } from 'vitest';
import { buildInviteUrl } from '../invite-create';

describe('buildInviteUrl', () => {
  it('returns the correct URL structure', () => {
    const url = buildInviteUrl('https://app.example.com', 'ABCDEFGH', 'user@example.com');
    expect(url).toBe('https://app.example.com/invite?code=ABCDEFGH&email=user%40example.com');
  });

  it('percent-encodes the email (@ and + are encoded)', () => {
    const url = buildInviteUrl('https://app.example.com', 'XYZXYZXY', 'a+b@x.com');
    // encodeURIComponent encodes + as %2B and @ as %40
    expect(url).toContain('email=a%2Bb%40x.com');
  });

  it('uses rawCode verbatim without dashes or formatting', () => {
    const rawCode = 'RAWCODE1';
    const url = buildInviteUrl('https://app.example.com', rawCode, 'test@example.com');
    expect(url).toContain(`code=${rawCode}`);
    // The code must not be reformatted with a dash
    expect(url).not.toContain('code=RAWC-ODE1');
  });

  it('uses the provided origin without modification', () => {
    const url = buildInviteUrl('https://pr-42.transformmynotes.com', 'CODE1234', 'u@example.com');
    expect(url.startsWith('https://pr-42.transformmynotes.com/invite')).toBe(true);
  });

  it('handles emails with subdomains and dots correctly', () => {
    const url = buildInviteUrl('https://app.example.com', 'AAAABBBB', 'user.name@sub.domain.co.uk');
    expect(url).toContain('email=user.name%40sub.domain.co.uk');
  });

  it('handles empty string rawCode without error', () => {
    const url = buildInviteUrl('https://app.example.com', '', 'user@example.com');
    expect(url).toBe('https://app.example.com/invite?code=&email=user%40example.com');
  });
});
