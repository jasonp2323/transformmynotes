'use client';
/**
 * Shared Cloudflare Turnstile widget for auth pages.
 *
 * Production always has NEXT_PUBLIC_TURNSTILE_SITE_KEY set via infra/application.ts.
 * In local dev without a site key, the widget is omitted and `onToken` is immediately
 * called with the sentinel value 'dev-no-turnstile' so the form is never permanently
 * blocked. The server route also accepts this value when Turnstile is disabled locally.
 *
 * In the fully-offline E2E harness the widget script can't reach cloudflare.com,
 * so the harness sets NEXT_PUBLIC_TURNSTILE_DISABLED=1 to bypass the live widget
 * and fire the sentinel immediately. This flag is set ONLY by the E2E global-setup —
 * pr-<N> stages (which DO have network) render the real widget with Cloudflare's
 * always-pass test sitekey, and production renders it with the real sitekey.
 * https://developers.cloudflare.com/turnstile/troubleshooting/testing/
 */
import React, { useEffect } from 'react';
import { Turnstile } from '@marsidev/react-turnstile';

export interface TurnstileWidgetProps {
  onToken: (token: string) => void;
  onExpire?: () => void;
}

export function TurnstileWidget({ onToken, onExpire }: TurnstileWidgetProps) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  // Bypass when there is no site key (local dev) or when the offline E2E harness
  // explicitly disables Turnstile (NEXT_PUBLIC_TURNSTILE_DISABLED=1) — the widget
  // script can't reach cloudflare.com there. Fire once so the form is never
  // permanently blocked. NOTE: pr-<N> and production always render the live widget.
  const isBypassed = !siteKey || process.env.NEXT_PUBLIC_TURNSTILE_DISABLED === '1';
  useEffect(() => {
    if (isBypassed) {
      onToken('dev-no-turnstile');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isBypassed) {
    return null;
  }

  return (
    <Turnstile
      siteKey={siteKey}
      onSuccess={(token) => onToken(token)}
      onError={() => {
        onToken('');
        if (onExpire) onExpire();
      }}
      onExpire={() => {
        onToken('');
        if (onExpire) onExpire();
      }}
    />
  );
}
