'use client';
import React, { useState } from 'react';
import { signIn, confirmSignIn, fetchAuthSession } from 'aws-amplify/auth';
import { useRouter } from 'next/navigation';
import { Input, Button, Icon } from '@/src/components/ui';
import { PasswordField, AuthLink } from '@/src/components/auth';
import { authErrorMessage } from '@/lib/auth-errors';
import { unhandledSignInStepMessage, passwordMatchError } from '@/lib/auth-next-step';

type Step = 'signin' | 'new-password';

export default function LoginPage() {
  const router = useRouter();

  // Sign-in step state
  const [step, setStep] = useState<Step>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New-password step state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  async function finalizeSession() {
    const session = await fetchAuthSession();
    const idToken = session.tokens?.idToken?.toString();
    if (idToken) {
      document.cookie = `CognitoIdToken=${idToken}; path=/; samesite=lax`;
    }
    router.push('/dashboard');
  }

  async function onSignInSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { isSignedIn, nextStep } = await signIn({ username: email, password });
      if (isSignedIn) {
        await finalizeSession();
        return;
      }
      const signInStep = nextStep.signInStep;
      if (signInStep === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') {
        setStep('new-password');
      } else {
        setError(unhandledSignInStepMessage(signInStep));
      }
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function onNewPasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    const matchErr = passwordMatchError(newPassword, confirmPassword);
    if (matchErr) {
      setError(matchErr);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const { isSignedIn, nextStep } = await confirmSignIn({ challengeResponse: newPassword });
      if (isSignedIn) {
        await finalizeSession();
        return;
      }
      setError(unhandledSignInStepMessage(nextStep.signInStep));
    } catch (err) {
      setError(authErrorMessage(err));
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
        overflow: 'hidden',
      }}
    >
      {/* Hero section */}
      <div
        style={{
          position: 'relative',
          background: 'var(--gradient-transform)',
          padding: '32px 30px 54px',
          overflow: 'hidden',
        }}
      >
        {/* Horizontal-line overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: 0.16,
            backgroundImage:
              'repeating-linear-gradient(transparent, transparent 30px, rgba(255,255,255,0.7) 30px, rgba(255,255,255,0.7) 31px)',
            pointerEvents: 'none',
          }}
          aria-hidden="true"
        />
        {/* Logo */}
        <div style={{ position: 'relative' }}>
          <img
            src="/assets/logo-mark.svg"
            width={46}
            height={46}
            alt=""
            style={{ filter: 'drop-shadow(0 6px 14px rgba(0,0,0,0.25))' }}
          />
          <h1
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 33,
              fontWeight: 600,
              color: '#fff',
              letterSpacing: '-0.02em',
              lineHeight: 1.12,
              margin: '20px 0 0',
              textShadow: '0 2px 12px rgba(0,0,0,0.18)',
            }}
          >
            Turn handwriting
            <br />
            into{' '}
            <span
              style={{
                background: 'var(--highlighter-strong)',
                padding: '0 6px',
                borderRadius: 5,
                color: '#211e17',
              }}
            >
              clean notes
            </span>
          </h1>
        </div>
      </div>

      {/* Form section */}
      <div
        style={{
          background: 'var(--surface-card)',
          borderRadius: '22px 22px 0 0',
          marginTop: -22,
          position: 'relative',
          padding: '26px 28px 32px',
        }}
      >
        {step === 'signin' && (
          <>
            <h2
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: 21,
                fontWeight: 600,
                color: 'var(--text-strong)',
                margin: '0 0 18px',
              }}
            >
              Sign in
            </h2>

            <form onSubmit={onSignInSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
              <Input
                label="Email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                leadingIcon={<Icon name="mail" size={18} />}
                required
              />

              <PasswordField
                value={password}
                onChange={setPassword}
                autoComplete="current-password"
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
                rightIcon={<Icon name="arrow-right" size={18} />}
              >
                Sign in
              </Button>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontFamily: 'var(--font-sans)',
                  fontSize: 14,
                  color: 'var(--text-muted)',
                }}
              >
                <AuthLink href="/request-access">Request access</AuthLink>
                <AuthLink href="/forgot-password">Forgot password?</AuthLink>
              </div>
            </form>
          </>
        )}

        {step === 'new-password' && (
          <>
            <h2
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: 21,
                fontWeight: 600,
                color: 'var(--text-strong)',
                margin: '0 0 8px',
              }}
            >
              Set a new password
            </h2>
            <p
              style={{
                margin: '0 0 18px',
                fontSize: 14,
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-sans)',
              }}
            >
              Your account requires a new password before you can continue.
            </p>

            <form onSubmit={onNewPasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
              <PasswordField
                label="New password"
                value={newPassword}
                onChange={setNewPassword}
                autoComplete="new-password"
                placeholder="New password"
                required
              />

              <PasswordField
                label="Confirm new password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                autoComplete="new-password"
                placeholder="Confirm password"
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
                rightIcon={<Icon name="arrow-right" size={18} />}
              >
                Set password &amp; sign in
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
