'use client';
import React, { useState, useEffect } from 'react';
import { signIn, fetchAuthSession } from 'aws-amplify/auth';
import { useRouter } from 'next/navigation';
import { configureAmplify } from '../../../lib/amplify-config';
import { Input, Button, IconButton } from '@/src/components/ui';

function EyeIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx={12} cy={12} r={3} />
    </svg>
  );
}

function EyeOffIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-10-7-10-7a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 7 10 7a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1={1} y1={1} x2={23} y2={23} />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    configureAmplify();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await signIn({ username: email, password });
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();
      if (idToken) {
        document.cookie = `CognitoIdToken=${idToken}; path=/; samesite=lax`;
      }
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-surface-app">
      <div className="w-full max-w-sm flex flex-col gap-6">
        <div className="flex flex-col items-center gap-3">
          <img
            src="/assets/logo-mark.svg"
            width={52}
            height={52}
            alt="TransformMyNotes"
          />
          <h1 className="font-serif text-2xl font-semibold text-text-strong">
            Welcome back
          </h1>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
            required
          />

          <Input
            label="Password"
            type={show ? 'text' : 'password'}
            value={password}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
            required
            trailingIcon={
              <IconButton
                label={show ? 'Hide password' : 'Show password'}
                type="button"
                onClick={() => setShow((s) => !s)}
              >
                {show ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
              </IconButton>
            }
          />

          <Button type="submit" variant="primary" size="lg" fullWidth>
            Sign in
          </Button>
        </form>

        {error && (
          <p role="alert" className="text-sm text-danger text-center">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
