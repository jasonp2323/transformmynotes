/**
 * M12 stub: Register the app for push notifications on native platforms.
 *
 * This is a minimal implementation that guards against server-side and web usage,
 * requests permissions, registers with Capacitor, and sends the token to the server.
 * Full server-side FCM dispatch and token storage is deferred to M13.
 *
 * @returns A promise that resolves when registration is complete (or skipped on non-native).
 */
export async function registerForPushNotifications(): Promise<void> {
  // No-op on server-side or non-native environments.
  if (typeof window === 'undefined') {
    return;
  }

  // Guard: only proceed on native platforms.
  const cap = await import('@capacitor/core').catch(() => null);
  if (!cap?.Capacitor?.isNativePlatform()) {
    return;
  }

  try {
    // Dynamic import of push-notifications plugin (only on native).
    const { PushNotifications } = await import('@capacitor/push-notifications');

    // Request permissions.
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== 'granted') {
      return;
    }

    // Register for push.
    await PushNotifications.register();

    // Listen for registration token and send it to the server.
    PushNotifications.addListener('registration', (token) => {
      fetch('/api/user/push-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.value }),
      }).catch(() => {
        // Silently ignore fetch failures; token delivery is best-effort in this stub.
      });
    });
  } catch {
    // Silently ignore errors; registration is best-effort.
  }
}

// TODO M13: complete FCM server-side dispatch
