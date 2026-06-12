import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { verifyTurnstile, TurnstileError } from '../turnstile';

const DUMMY_SECRET = 'test-secret-key';
const DUMMY_TOKEN = 'tok';

describe('verifyTurnstile', () => {
  let originalSecret: string | undefined;

  beforeEach(() => {
    originalSecret = process.env.TURNSTILE_SECRET_KEY;
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.TURNSTILE_SECRET_KEY;
    } else {
      process.env.TURNSTILE_SECRET_KEY = originalSecret;
    }
    vi.restoreAllMocks();
  });

  it('resolves without throwing when Cloudflare returns success: true', async () => {
    process.env.TURNSTILE_SECRET_KEY = DUMMY_SECRET;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ success: true }),
      }),
    );

    await expect(verifyTurnstile(DUMMY_TOKEN)).resolves.toBeUndefined();
  });

  it('throws TurnstileError when Cloudflare returns success: false', async () => {
    process.env.TURNSTILE_SECRET_KEY = DUMMY_SECRET;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ success: false }),
      }),
    );

    await expect(verifyTurnstile(DUMMY_TOKEN)).rejects.toThrow(TurnstileError);
    await expect(verifyTurnstile(DUMMY_TOKEN)).rejects.toThrow(
      'Turnstile verification failed',
    );
  });

  it('throws Error with exact message when TURNSTILE_SECRET_KEY is not set', async () => {
    delete process.env.TURNSTILE_SECRET_KEY;

    await expect(verifyTurnstile(DUMMY_TOKEN)).rejects.toThrow(
      'TURNSTILE_SECRET_KEY is not set',
    );
  });
});
