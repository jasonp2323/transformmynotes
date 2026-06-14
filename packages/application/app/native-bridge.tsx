'use client';
import { useEffect } from 'react';
import { isExternalUrl } from '../src/lib/is-external-url';

/**
 * NativeBridge — mounts as a null component in the root layout and wires up
 * all Capacitor-specific native integrations when running inside the Android
 * shell. Guards every import with `isNativePlatform()` so the web build is
 * completely unaffected.
 */
export function NativeBridge(): null {
  useEffect(() => {
    let cleanupBackButton: (() => void) | undefined;
    let cleanupClickListener: (() => void) | undefined;

    void (async () => {
      // Bail early when not running inside a Capacitor native shell.
      const cap = await import('@capacitor/core').catch(() => null);
      if (!cap?.Capacitor?.isNativePlatform()) return;

      // ── Status Bar ──────────────────────────────────────────────────────────
      try {
        const { StatusBar, Style } = await import('@capacitor/status-bar');
        await StatusBar.setStyle({ style: Style.Light });
        // setBackgroundColor is Android-only; swallow on iOS or unsupported configs.
        try {
          await StatusBar.setBackgroundColor({ color: '#FAF8F3' });
        } catch {
          // intentionally swallowed — no-op on some configs
        }
      } catch {
        // StatusBar plugin unavailable — continue without it.
      }

      // ── Back Button ─────────────────────────────────────────────────────────
      try {
        const { App } = await import('@capacitor/app');
        const handle = await App.addListener('backButton', ({ canGoBack }) => {
          if (window.history.length > 1 && canGoBack) {
            window.history.back();
          } else {
            void App.exitApp();
          }
        });
        cleanupBackButton = () => {
          void handle.remove();
        };
      } catch {
        // App plugin unavailable — continue without it.
      }

      // ── External-link interception (Chrome Custom Tabs) ──────────────────
      try {
        const clickHandler = (event: MouseEvent) => {
          const anchor = (event.target as Element | null)?.closest('a[href]') as HTMLAnchorElement | null;
          if (!anchor) return;

          const href = anchor.getAttribute('href') ?? '';
          if (!isExternalUrl(href)) return;

          event.preventDefault();
          void (async () => {
            try {
              const { Browser } = await import('@capacitor/browser');
              await Browser.open({ url: href });
            } catch {
              // Fallback: let the system handle it if Browser plugin fails.
              window.open(href, '_blank', 'noopener,noreferrer');
            }
          })();
        };

        document.addEventListener('click', clickHandler, true /* capturing */);
        cleanupClickListener = () => {
          document.removeEventListener('click', clickHandler, true);
        };
      } catch {
        // Defensive catch around the listener registration itself.
      }
    })();

    return () => {
      cleanupBackButton?.();
      cleanupClickListener?.();
    };
  }, []);

  return null;
}
