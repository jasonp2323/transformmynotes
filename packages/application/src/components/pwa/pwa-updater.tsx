'use client';

import React, { useEffect, useRef, useState } from 'react';

/**
 * PwaUpdater — registers /sw.js and drives the update-available prompt.
 *
 * Strategy (M22.1.3):
 * - Registers the SW on load (guarded: browser-only, disabled in dev via sw.ts).
 * - If a new SW is already waiting at registration time → show prompt immediately.
 * - Listens for updatefound → new worker reaching "installed" while a controller
 *   is already active → show prompt (update arrived mid-session).
 * - Re-checks for updates on every document visibility gain so a new deploy that
 *   landed while the tab was hidden surfaces the prompt promptly.
 * - "Reload" posts {type:'SKIP_WAITING'} to the waiting worker so sw.ts's
 *   skipWaiting() fires, then reloads once controllerchange fires.
 * - A module-level `accepted` flag prevents the first-install clientsClaim from
 *   triggering an unwanted reload loop (only reloads when the user accepted).
 * - A guard prevents double-reload if controllerchange fires more than once.
 */

// Module-level flag: set true only after the user clicks "Reload".
// Guards the controllerchange handler so first-install clientsClaim never
// triggers a reload loop.
let accepted = false;
let reloadGuard = false;

export function PwaUpdater(): React.ReactElement | null {
  const [showPrompt, setShowPrompt] = useState(false);
  const waitingWorkerRef = useRef<ServiceWorker | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    let cleanupVisibility: (() => void) | undefined;
    let cleanupControllerChange: (() => void) | undefined;

    const handleControllerChange = () => {
      if (accepted && !reloadGuard) {
        reloadGuard = true;
        window.location.reload();
      }
    };

    void (async () => {
      let reg: ServiceWorkerRegistration | null = null;
      try {
        reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      } catch {
        // /sw.js won't exist in dev (disabled at build time) — swallow silently.
        return;
      }

      // Already a waiting worker at registration time (e.g. tab was reopened
      // after a deploy while the old tab was still open).
      if (reg.waiting) {
        waitingWorkerRef.current = reg.waiting;
        setShowPrompt(true);
      }

      // New worker found during this session (SW update arrived mid-session).
      reg.addEventListener('updatefound', () => {
        const newWorker = reg!.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (
            newWorker.state === 'installed' &&
            navigator.serviceWorker.controller
          ) {
            // A new version is ready; the old one is still controlling.
            waitingWorkerRef.current = newWorker;
            setShowPrompt(true);
          }
        });
      });

      // Re-check for updates whenever the tab becomes visible.
      const handleVisibility = () => {
        if (document.visibilityState === 'visible') {
          void reg!.update();
        }
      };
      document.addEventListener('visibilitychange', handleVisibility);
      cleanupVisibility = () =>
        document.removeEventListener('visibilitychange', handleVisibility);

      // Listen for controller change to trigger the reload (after user accepts).
      navigator.serviceWorker.addEventListener(
        'controllerchange',
        handleControllerChange,
      );
      cleanupControllerChange = () =>
        navigator.serviceWorker.removeEventListener(
          'controllerchange',
          handleControllerChange,
        );
    })();

    return () => {
      cleanupVisibility?.();
      cleanupControllerChange?.();
    };
  }, []);

  const handleReload = () => {
    const waiting = waitingWorkerRef.current;
    if (!waiting) return;
    accepted = true;
    waiting.postMessage({ type: 'SKIP_WAITING' });
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
  };

  if (!showPrompt) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="tmn-toast"
      style={{
        // Brand cream surface / teal accent — override the default toast border
        // with the teal brand colour to match our M22.1 brand spec.
        background: '#FAF8F3',
        borderLeftColor: '#16747e',
      }}
    >
      <div className="tmn-toast__body">
        <div className="tmn-toast__title">A new version is available.</div>
        <div className="tmn-toast__desc" style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            onClick={handleReload}
            className="tmn-btn tmn-btn--sm tmn-btn--primary"
            style={{ minHeight: 32, padding: '6px 14px', fontSize: 13 }}
          >
            Reload
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="tmn-btn tmn-btn--sm tmn-btn--ghost"
            style={{ minHeight: 32, padding: '6px 10px', fontSize: 13 }}
            aria-label="Dismiss update notification"
          >
            Later
          </button>
        </div>
      </div>
      <button
        type="button"
        className="tmn-toast__close"
        aria-label="Dismiss"
        onClick={handleDismiss}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
          <line
            x1="3"
            y1="3"
            x2="13"
            y2="13"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <line
            x1="13"
            y1="3"
            x2="3"
            y2="13"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}
