'use client';

import { useEffect, useRef } from 'react';
import { getCurrentUserSub, replayMutations, replayCaptures } from '@/src/lib/offline';

// ── SyncProvider ──────────────────────────────────────────────────────────────
// Mounted once in the app layout. Drains the offline mutation + capture queues
// whenever the user comes back online, or when the service worker signals that
// a Background Sync event fired (via REPLAY_SYNC message).

export function SyncProvider() {
  const drainingRef = useRef(false);

  const drain = async () => {
    if (drainingRef.current) return;
    drainingRef.current = true;
    try {
      const sub = await getCurrentUserSub();
      if (!sub) return;

      const [mutResult, capResult] = await Promise.all([
        replayMutations(sub),
        replayCaptures(sub),
      ]);

      // Surface a brief notification for conflicts so the user knows to open the note.
      if (mutResult.conflicts.length > 0) {
        showToast(
          `Some edits couldn't sync — open the note to resolve.`,
          'warning',
        );
      }

      // Notify about processed captures.
      if (capResult.processed.length > 0) {
        const n = capResult.processed.length;
        showToast(`${n} queued capture${n === 1 ? '' : 's'} processed.`, 'success');
      }
    } catch {
      // Drain errors are non-fatal — silently skip.
    } finally {
      drainingRef.current = false;
    }
  };

  useEffect(() => {
    // Drain once on mount (covers the "just came back online after a hard refresh" case).
    void drain();

    const handleOnline = () => void drain();
    window.addEventListener('online', handleOnline);

    // Listen for REPLAY_SYNC messages from the service worker (Background Sync).
    const handleMessage = (event: MessageEvent) => {
      if (event.data && (event.data as { type?: string }).type === 'REPLAY_SYNC') {
        void drain();
      }
    };
    navigator.serviceWorker?.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('online', handleOnline);
      navigator.serviceWorker?.removeEventListener('message', handleMessage);
    };
    // drain is defined outside useEffect and is stable (no deps) — intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

SyncProvider.displayName = 'SyncProvider';

// ── Internal toast helper ─────────────────────────────────────────────────────
// Lightweight transient notification — same markup pattern as PwaUpdater's
// tmn-toast so it picks up the shared CSS variable styling without adding a
// new dependency on the Toast component (which needs JSX state plumbing).

function showToast(message: string, tone: 'success' | 'warning') {
  if (typeof document === 'undefined') return;

  const el = document.createElement('div');
  el.className = 'tmn-toast';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.style.cssText = [
    'position:fixed',
    'bottom:24px',
    'left:50%',
    'transform:translateX(-50%)',
    'z-index:9999',
    'display:flex',
    'align-items:center',
    'gap:10px',
    'padding:12px 18px',
    'border-radius:10px',
    'box-shadow:0 4px 24px rgba(0,0,0,0.13)',
    'font-family:var(--font-sans)',
    'font-size:14px',
    'line-height:1.4',
    'max-width:calc(100vw - 48px)',
    'color:var(--stone-900)',
    tone === 'success'
      ? 'background:var(--success-50,#f0fdf4);border:1px solid var(--success-200,#bbf7d0)'
      : 'background:var(--warning-50,#fffbeb);border:1px solid var(--warning-200,#fde68a)',
  ].join(';');
  el.textContent = message;

  document.body.appendChild(el);

  // Auto-dismiss after 4 seconds with a fade-out.
  setTimeout(() => {
    el.style.transition = 'opacity 0.3s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 320);
  }, 4000);
}
