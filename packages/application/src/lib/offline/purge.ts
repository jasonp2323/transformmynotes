import { OWNED_CACHE_PREFIX } from './constants';
import { clearOfflineReadStore } from './readStore';

/**
 * Delete all app-owned Cache API caches + wipe the IndexedDB read store.
 * Called on sign-out so the next user on this device never sees cached data.
 */
export async function purgeOfflineCaches(): Promise<void> {
  try {
    if (typeof caches !== 'undefined') {
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n.startsWith(OWNED_CACHE_PREFIX)).map((n) => caches.delete(n)),
      );
    }
  } catch {
    /* best effort */
  }
  await clearOfflineReadStore();
}
