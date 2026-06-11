'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input, Button, Textarea } from '@/src/components/ui';
import { AuthLink } from '@/src/components/auth';
import { Brandmark } from '@/src/components/brand';

export default function RequestAccessPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/request-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, note: note || undefined }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (data.ok) {
        router.push(`/pending?email=${encodeURIComponent(email)}`);
      } else {
        setError(data.error ?? 'Something went wrong. Please try again.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
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
        Request access
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
        Submit your details and an admin will review your request.
      </p>

      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Input
          label="Full name"
          type="text"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Jane Smith"
          required
        />

        <Input
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
          required
        />

        <Textarea
          label="Anything we should know? (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Tell us a bit about how you'd use the app…"
          rows={3}
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

        <Button
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          loading={loading}
        >
          Request access
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
        Already have an account?{' '}
        <AuthLink href="/login">Sign in</AuthLink>
      </div>
    </div>
  );
}
