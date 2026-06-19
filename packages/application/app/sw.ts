/// <reference lib="webworker" />
import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { Serwist } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // Injected at build time by @serwist/next: the precache manifest of the
    // app shell + Next static assets (content-hashed → safe to cache-first).
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // Do NOT auto-activate a new SW — wait until the user accepts the update
  // prompt (M22.1.3) so deploys never silently swap the UI mid-session.
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  // defaultCache = network-first for navigations/pages (keeps deploys instant)
  // + cache-first for hashed /_next/static assets.
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [
      {
        // Branded offline page (built by the parallel task at app/offline/page.tsx).
        url: '/offline',
        matcher({ request }) {
          return request.destination === 'document';
        },
      },
    ],
  },
});

// Let the page tell a waiting SW to activate (drives the "Reload" button).
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    void self.skipWaiting();
  }
});

serwist.addEventListeners();
