/// <reference lib="webworker" />
import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import {
  Serwist,
  StaleWhileRevalidate,
  ExpirationPlugin,
  CacheableResponsePlugin,
} from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // Injected at build time by @serwist/next: the precache manifest of the
    // app shell + Next static assets (content-hashed → safe to cache-first).
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// Read API runtime cache entry — StaleWhileRevalidate so the library and note
// views load instantly from cache while silently refreshing in the background.
// Cache name must stay in sync with READ_API_CACHE in
// src/lib/offline/constants.ts ('tmn-read-api').
const readApiCache = {
  matcher: ({
    url,
    request,
  }: {
    url: URL;
    request: Request;
  }) =>
    request.method === 'GET' &&
    url.origin === self.location.origin &&
    url.pathname.startsWith('/api/notes'),
  handler: new StaleWhileRevalidate({
    cacheName: 'tmn-read-api', // READ_API_CACHE — keep in sync with src/lib/offline/constants.ts
    plugins: [
      new ExpirationPlugin({
        maxEntries: 64,
        maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
      }),
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
    ],
  }),
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // Do NOT auto-activate a new SW — wait until the user accepts the update
  // prompt (M22.1.3) so deploys never silently swap the UI mid-session.
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  // readApiCache is prepended so it takes precedence over defaultCache entries.
  // defaultCache = network-first for navigations/pages (keeps deploys instant)
  // + cache-first for hashed /_next/static assets.
  runtimeCaching: [readApiCache, ...defaultCache],
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
