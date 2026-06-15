'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { signIn, fetchAuthSession } from 'aws-amplify/auth';
import { useRouter } from 'next/navigation';
import { Input, Button, Icon, Avatar, Card, Badge } from '@/src/components/ui';
import { PasswordField, TurnstileWidget } from '@/src/components/auth';
import { Brandmark } from '@/src/components/brand';

/* ------------------------------------------------------------------ */
/* LockedField — a read-only field row matching the design spec         */
/* ------------------------------------------------------------------ */

interface LockedFieldProps {
  label: string;
  value: string;
  icon: string;
  badge?: string;
  mono?: boolean;
}

function LockedField({ label, value, icon, badge, mono }: LockedFieldProps) {
  return (
    <div className="tmn-field">
      <label className="tmn-field__label">{label}</label>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '11px 14px',
          minHeight: 44,
          boxSizing: 'border-box',
          background: 'var(--stone-100)',
          border: '1.5px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
        }}
      >
        <Icon name={icon} size={18} color="var(--text-subtle)" />
        <span
          style={{
            flex: 1,
            fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
            fontSize: mono ? 14 : 15,
            color: 'var(--text-body)',
            fontWeight: mono ? 600 : 400,
          }}
        >
          {value}
        </span>
        {badge ? (
          <Badge tone="success" dot>
            {badge}
          </Badge>
        ) : (
          <Icon name="lock" size={15} color="var(--text-subtle)" />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Validate API response shape                                          */
/* ------------------------------------------------------------------ */

interface ValidateResponse {
  valid: boolean;
  groupName: string | null;
  inviterName: string | null;
  expiresAt: string | null;
  type: 'email' | 'code';
  email: string | null;
}

/* ------------------------------------------------------------------ */
/* InviteContent — uses useSearchParams, must be inside Suspense        */
/* ------------------------------------------------------------------ */

function InviteContent() {
  const router = useRouter();
  const params = useSearchParams();
  const code = params.get('code') ?? '';
  const emailParam = params.get('email') ?? '';

  const [status, setStatus] = useState<'loading' | 'valid' | 'invalid'>('loading');
  const [validation, setValidation] = useState<ValidateResponse | null>(null);

  // Editable fields
  const [emailInput, setEmailInput] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState('');

  // Validate on mount
  useEffect(() => {
    if (!code) {
      setStatus('invalid');
      return;
    }
    (async () => {
      try {
        const body: { code: string; email?: string } = { code };
        if (emailParam) body.email = emailParam;
        const res = await fetch('/api/auth/invite/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (res.status === 429) {
          setStatus('invalid');
          return;
        }
        const data = (await res.json()) as ValidateResponse;
        if (data.valid) {
          setValidation(data);
          // Pre-fill email from validation if available (overrides URL param)
          setEmailInput(data.email ?? emailParam);
          setStatus('valid');
        } else {
          setStatus('invalid');
        }
      } catch {
        setStatus('invalid');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- Loading state -------------------------------------------- */
  if (status === 'loading') {
    return (
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          borderRadius: 'var(--radius-xl)',
          background: 'var(--surface-card)',
          boxShadow: 'var(--shadow-lg)',
          padding: '48px 32px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <Brandmark size={32} />
        <p
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 15,
            color: 'var(--text-muted)',
            margin: 0,
          }}
        >
          Checking your invite…
        </p>
      </div>
    );
  }

  /* ---- Invalid state -------------------------------------------- */
  if (status === 'invalid') {
    return (
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          borderRadius: 'var(--radius-xl)',
          background: 'var(--surface-card)',
          boxShadow: 'var(--shadow-lg)',
          padding: '36px 32px 32px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 0,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
          <Brandmark size={32} />
        </div>
        <h1
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 24,
            fontWeight: 600,
            color: 'var(--text-strong)',
            letterSpacing: '-0.01em',
            margin: '0 0 10px',
            textAlign: 'center',
          }}
        >
          Invite not valid
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
          This invite link is invalid, expired, or has already been used.
        </p>
        <Link
          href="/login"
          className="tmn-btn tmn-btn--ghost tmn-btn--md tmn-btn--full"
          style={{ textDecoration: 'none' }}
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  /* ---- Valid state — main form ----------------------------------- */

  // The locked email: use validation.email if set; otherwise emailParam.
  // If neither is present (code-type invite, no email) we show an editable Input.
  const lockedEmail = validation?.email ?? (emailParam || null);
  const isEmailLocked = lockedEmail !== null;
  // The email we'll send to redeem:
  const redeemEmail = isEmailLocked ? lockedEmail : emailInput;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/invite/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, email: redeemEmail, name, password, turnstileToken }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (data.ok) {
        // Account created — sign in with Amplify, then hand the token to the
        // server so it can set an HttpOnly session cookie (no client-side cookie write).
        try {
          await signIn({ username: redeemEmail, password });
          const session = await fetchAuthSession();
          const idToken = session.tokens?.idToken?.toString();
          if (idToken) {
            await fetch('/api/auth/set-session', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ idToken }),
            });
          }
          router.push('/dashboard');
        } catch {
          // Account was created but auto sign-in failed; redirect to login
          setError('Account created! Please sign in to continue.');
          router.push('/login');
        }
      } else {
        setError(data.error ?? 'Something went wrong. Please try again.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // Compute days remaining for expiry fine print
  let expiryText: string | null = null;
  if (validation?.expiresAt) {
    try {
      const msRemaining = new Date(validation.expiresAt).getTime() - Date.now();
      const daysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24));
      if (daysRemaining > 0) {
        expiryText = `This invite expires in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}.`;
      } else {
        expiryText = 'This invite expires soon.';
      }
    } catch {
      expiryText = 'This invite expires soon.';
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
      {/* Brandmark */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
        <Brandmark size={30} />
      </div>

      {/* Inviter card — shown only when inviterName is present */}
      {validation?.inviterName && (
        <Card
          padded
          style={{
            background: 'var(--surface-brand-soft)',
            borderColor: 'transparent',
            marginBottom: 22,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar name={validation.inviterName} size="md" />
            <div>
              <div
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: 14,
                  color: 'var(--text-muted)',
                }}
              >
                <strong style={{ color: 'var(--text-strong)' }}>{validation.inviterName}</strong>{' '}
                invited you
              </div>
              {validation.groupName && (
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    color: 'var(--brand-strong)',
                    marginTop: 2,
                  }}
                >
                  to join {validation.groupName}
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Heading & subtext */}
      <h1
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 26,
          fontWeight: 600,
          color: 'var(--text-strong)',
          letterSpacing: '-0.01em',
          margin: '0 0 6px',
        }}
      >
        Accept your invite
      </h1>
      <p
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 15.5,
          color: 'var(--text-muted)',
          margin: '0 0 22px',
          lineHeight: 1.5,
        }}
      >
        Your email and code are already confirmed. Just set a name and password.
      </p>

      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
        {/* Email — locked or editable depending on invite type */}
        {isEmailLocked ? (
          <LockedField label="Email" value={lockedEmail} icon="mail" />
        ) : (
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            placeholder="you@email.com"
            leadingIcon={<Icon name="mail" size={18} />}
            required
          />
        )}

        {/* Invite code — always locked */}
        <LockedField label="Invite code" value={code} icon="ticket" badge="Validated" mono />

        {/* Full name */}
        <Input
          label="Full name"
          type="text"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          required
        />

        {/* Password */}
        <PasswordField
          label="Create password"
          hint="At least 8 characters."
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          required
        />

        {/* Error */}
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

        {/* Submit */}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          loading={submitting}
          disabled={!turnstileToken}
          leftIcon={<Icon name="user-plus" size={18} />}
          style={{ marginTop: 7 }}
        >
          Accept &amp; create account
        </Button>
      </form>

      {/* Expiry fine print */}
      {expiryText && (
        <p
          style={{
            textAlign: 'center',
            fontFamily: 'var(--font-sans)',
            fontSize: 12.5,
            color: 'var(--text-subtle)',
            margin: '16px 0 0',
            lineHeight: 1.5,
          }}
        >
          {expiryText}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Default export — wraps InviteContent in Suspense (useSearchParams)  */
/* ------------------------------------------------------------------ */

export default function InvitePage() {
  return (
    <React.Suspense fallback={<div style={{ width: '100%', maxWidth: 420 }} />}>
      <InviteContent />
    </React.Suspense>
  );
}
