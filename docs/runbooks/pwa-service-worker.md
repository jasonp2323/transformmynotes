# PWA Service Worker — Versioning & Update Strategy (M22.1)

## Overview

The application uses [Serwist](https://serwist.pages.dev/) (`serwist` + `@serwist/next` v9.5.11) to provide offline support and a PWA shell. The service worker is compiled from `packages/application/app/sw.ts` into `packages/application/public/sw.js` at build time by `@serwist/next`.

`public/sw.js` is gitignored — it is a build artifact, never committed.

---

## Caching Strategy

### #1 Constraint: every deploy is instantly live

The cache configuration is deliberately chosen to guarantee that a new production deploy is immediately visible — no stale-UI trap.

| Asset type | Strategy | Rationale |
|---|---|---|
| Navigation documents (HTML pages) | **Network-first** | The browser always tries the network first; users see the latest page on every load even while a new SW is pending. Serves the cached copy only when offline. |
| `/_next/static/**` (JS, CSS, fonts) | **Cache-first** | These files are content-hashed by Next.js (immutable). The hash changes on every deploy, so a new build produces new URLs that aren't in the old cache — safe to serve from cache indefinitely. |
| App shell (precache manifest) | **Cache-first, content-hashed** | `@serwist/next` injects `__SW_MANIFEST` at build time — a manifest of every static file with its content hash. A deploy produces a new manifest → new precache revision → old entries purged automatically. |

This is implemented via `defaultCache` from `@serwist/next/worker` — no custom strategy code required.

---

## Versioning

Every `next build` produces a new precache manifest injected into `sw.ts` as `self.__SW_MANIFEST`. The manifest entries are content-hashed, so:

1. New deploy → new content hashes → new SW file with a new manifest.
2. Browser detects the changed `/sw.js` → installs the new SW alongside the old one.
3. New SW enters **waiting** state (because `skipWaiting: false` in `sw.ts`).
4. `PwaUpdater` component detects the waiting worker → shows the update prompt.
5. User clicks **Reload** → `PwaUpdater` posts `{ type: 'SKIP_WAITING' }` to the waiting SW → `skipWaiting()` fires → new SW activates → `controllerchange` event → page reloads.

---

## Update Prompt (M22.1.3)

`PwaUpdater` (`packages/application/src/components/pwa/pwa-updater.tsx`) is a `'use client'` null-rendering component mounted in `app/layout.tsx`. It:

- Registers `/sw.js` on first load.
- Detects an already-waiting SW at registration time (tab reopened after a deploy).
- Listens for `updatefound` → new worker reaching `state === 'installed'` while a controller is already active (update arrived mid-session).
- Calls `reg.update()` on every `visibilitychange` to `visible` so a deploy that happened while the tab was hidden surfaces the prompt promptly.
- Shows a toast with **Reload** and **Later** buttons.
- On **Reload**: posts `SKIP_WAITING` to the waiting worker; the `controllerchange` handler reloads the page.

### First-install reload guard

`clientsClaim: true` causes the new SW to immediately claim all clients on first activation. This fires `controllerchange` even on first install. Without a guard this would cause a reload loop on every fresh install.

Guard: a module-level `accepted` boolean (default `false`). The `controllerchange` handler only reloads if `accepted === true`. `accepted` is set to `true` only when the user clicks **Reload**. First-install activation sets no `accepted` flag → no reload.

---

## Development

The SW is **disabled in development** (`disable: process.env.NODE_ENV === 'development'` in `next.config.mjs`). Running `npm run dev:application` will not generate or register a service worker, avoiding confusing cache behaviour during local development.

---

## Capacitor (Android)

`packages/mobile` wraps `app.transformmynotes.com` in a native WebView via `server.url`. The WebView loads the same HTML/JS/CSS from the server, so it automatically benefits from the SW's offline support and the update prompt — no separate mobile-specific SW configuration is needed.

---

## File locations

| File | Purpose |
|---|---|
| `packages/application/app/sw.ts` | SW source — compiled by `@serwist/next` at build time. |
| `packages/application/public/sw.js` | Generated SW — gitignored, produced by `next build`. |
| `packages/application/next.config.mjs` | Wraps `nextConfig` with `withSerwistInit`. |
| `packages/application/src/components/pwa/pwa-updater.tsx` | Client component — registers SW, shows update toast. |
| `packages/application/app/layout.tsx` | Mounts `<PwaUpdater />` in the root layout. |
