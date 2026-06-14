'use client';
/**
 * Shared Cloudflare Turnstile widget for auth pages.
 *
 * Production always has NEXT_PUBLIC_TURNSTILE_SITE_KEY set via infra/application.ts.
 * In local dev without a site key, the widget is omitted and `onToken` is immediately
 * called with the sentinel value 'dev-no-turnstile' so the form is never permanently
 * blocked. The server route also accepts this value when Turnstile is disabled locally.
 */
import React, { useEffect } from 'react';
import { Turnstile } from '@marsidev/react-turnstile';

export interface TurnstileWidgetProps {
  onToken: (token: string) => void;
  onExpire?: () => void;
}

export function TurnstileWidget({ onToken, onExpire }: TurnstileWidgetProps) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  // No site key: local dev bypass — fire once so the form is not permanently blocked.
  // NOTE: production always has NEXT_PUBLIC_TURNSTILE_SITE_KEY set.
  useEffect(() => {
    if (!siteKey) {
      onToken('dev-no-turnstile');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!siteKey) {
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
