'use client';
import React, { useState, Suspense } from 'react';
import { confirmResetPassword } from 'aws-amplify/auth';
import { useRouter, useSearchParams } from 'next/navigation';
import { Input, Button } from '@/src/components/ui';
import { PasswordField, AuthLink } from '@/src/components/auth';
import { Brandmark } from '@/src/components/brand';

function ResetForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialEmail = searchParams.get('email') ?? '';

  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await confirmResetPassword({
        username: email,
        confirmationCode: code,
        newPassword: password,
      });
      setSuccess(true);
      setTimeout(() => router.push('/login'), 2000);
    } catch {
      setError('Unable to reset password. Please check your code and try again.');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div style={{ textAlign: 'center', padding: '16px 0' }}>
        <p
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 17,
            color: 'var(--success)',
            marginBottom: 16,
          }}
        >
          Password reset successfully! Redirecting to sign in&hellip;
        </p>
        <AuthLink href="/login">Sign in now</AuthLink>
      </div>
    );
  }

  return (
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

      <Input
        label="Verification code"
        type="text"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Enter the code we sent you"
        required
        autoComplete="one-time-code"
      />

      <PasswordField
        label="New password"
        hint="At least 8 characters."
        autoComplete="new-password"
        value={password}
        onChange={setPassword}
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

      <Button
        type="submit"
        variant="primary"
        size="lg"
        fullWidth
        loading={loading}
      >
        Reset password
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
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
        Set a new password
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
        Enter the code we emailed you and choose a new password.
      </p>

      <Suspense fallback={null}>
        <ResetForm />
      </Suspense>

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
