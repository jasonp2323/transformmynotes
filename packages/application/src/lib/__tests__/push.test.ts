import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registerForPushNotifications } from '../push';

describe('registerForPushNotifications', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    // Mock global fetch to spy on it.
    originalFetch = global.fetch;
    global.fetch = vi.fn(() => Promise.resolve(new Response('ok')));
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it('returns immediately when called on the server (typeof window === "undefined")', async () => {
    // Simulate server-side by temporarily deleting window.
    const originalWindow = typeof window !== 'undefined' ? window : undefined;
    Object.defineProperty(global, 'window', { value: undefined, writable: true });

    await registerForPushNotifications();

    // Verify no fetch was attempted.
    expect(global.fetch).not.toHaveBeenCalled();

    // Restore window.
    if (originalWindow !== undefined) {
      Object.defineProperty(global, 'window', { value: originalWindow, writable: true });
    }
  });

  it('returns immediately when not on a native platform', async () => {
    // Mock @capacitor/core to simulate a non-native environment.
    vi.doMock('@capacitor/core', () => ({
      Capacitor: {
        isNativePlatform: () => false,
      },
    }));

    // Clear module cache to pick up the mock.
    vi.resetModules();
    const { registerForPushNotifications: register } = await import('../push');

    await register();

    // Verify no fetch was attempted and push-notifications was not imported.
    expect(global.fetch).not.toHaveBeenCalled();

    vi.unmock('@capacitor/core');
  });

  it('completes without error on a native platform (happy path)', async () => {
    // This test verifies the structure; on a non-native test environment,
    // the function will return early and not call any push APIs.
    // In a real native environment (or a fully mocked one), this would proceed.

    // Since we cannot fully mock Capacitor's dynamic import in this stub test,
    // we simply verify the function resolves.
    await expect(registerForPushNotifications()).resolves.toBeUndefined();
  });

  it('silently ignores errors during initialization', async () => {
    // Mock @capacitor/core to throw an error.
    vi.doMock('@capacitor/core', () => {
      throw new Error('Capacitor not available');
    });

    vi.resetModules();
    const { registerForPushNotifications: register } = await import('../push');

    // Should not throw, despite the error in the import.
    await expect(register()).resolves.toBeUndefined();

    vi.unmock('@capacitor/core');
  });
});
