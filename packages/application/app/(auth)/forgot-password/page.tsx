'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input, Button } from '@/src/components/ui';
import { AuthLink, TurnstileWidget } from '@/src/components/auth';
import { Brandmark } from '@/src/components/brand';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, turnstileToken }),
      });
      if (res.status === 429) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? 'Too many attempts. Please try again later.');
        return;
      }
      // Always proceed to reset-password for 200 (and swallow other errors
      // to avoid email enumeration, matching the original behaviour).
      router.push(`/reset-password?email=${encodeURIComponent(email)}`);
    } catch {
      // Intentionally swallow error — always proceed to avoid email enumeration
      router.push(`/reset-password?email=${encodeURIComponent(email)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 420,
        borderRadius: 'var(--radius-xl)',
        background: 'var(--surface-card)',
        boxShadow: 'var(--shadow-lg)',
        padding: '36px 32px 32px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
        <Brandmark size={36} />
      </div>

      <h1
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 26,
          fontWeight: 600,
          color: 'var(--text-strong)',
          letterSpacing: '-0.01em',
          margin: '0 0 8px',
          textAlign: 'center',
        }}
      >
        Reset your password
      </h1>
      <p
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 15.5,
          color: 'var(--text-muted)',
          margin: '0 0 28px',
          lineHeight: 1.55,
          textAlign: 'center',
        }}
      >
        Enter your email and we&rsquo;ll send you a reset code.
      </p>

      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
          required
        />

        {error && (
          <p
            role="alert"
            style={{
              margin: 0,
              fontSize: 14,
              color: 'var(--danger-500)',
              fontFamily: 'var(--font-sans)',
            }}
          >
            {error}
          </p>
        )}

        <TurnstileWidget onToken={setTurnstileToken} />

        <Button
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          loading={loading}
          disabled={!turnstileToken}
        >
          Send reset code
        </Button>
      </form>

      <div
        style={{
          textAlign: 'center',
          marginTop: 20,
          fontFamily: 'var(--font-sans)',
          fontSize: 14,
          color: 'var(--text-muted)',
        }}
      >
        <AuthLink href="/login">Back to sign in</AuthLink>
      </div>
    </div>
  );
}
