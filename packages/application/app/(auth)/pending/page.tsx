'use client';
import React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Icon } from '@/src/components/ui';

const steps = [
  { label: 'Request received', done: true, active: false, sub: 'Just now' },
  { label: 'Admin review', done: false, active: true, sub: 'Usually within a day' },
  { label: 'Access granted', done: false, active: false, sub: "We’ll email you" },
] as const;

function PendingContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get('email') ?? '';

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
      {/* Hourglass badge */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 26 }}>
        <div
          aria-hidden="true"
          style={{
            width: 96,
            height: 96,
            borderRadius: 28,
            background: 'var(--gradient-transform)',
            boxShadow: 'var(--shadow-brand)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="hourglass" size={42} color="#fff" />
        </div>
      </div>

      {/* Heading */}
      <h1
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 27,
          fontWeight: 600,
          color: 'var(--text-strong)',
          letterSpacing: '-0.01em',
          margin: '0 0 10px',
          textAlign: 'center',
        }}
      >
        Your request is in
      </h1>

      {/* Subtext */}
      <p
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 16.5,
          color: 'var(--text-muted)',
          margin: '0 0 26px',
          lineHeight: 1.6,
          maxWidth: 290,
          textAlign: 'center',
          marginLeft: 'auto',
          marginRight: 'auto',
        }}
      >
        Thanks for your interest. An admin will review your request shortly.
      </p>

      {/* Timeline */}
      <div
        style={{
          width: '100%',
          textAlign: 'left',
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
          marginBottom: 24,
        }}
      >
        {steps.map((s, i) => (
          <div key={s.label} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            {/* Node column */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  flex: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: s.done
                    ? 'var(--brand)'
                    : s.active
                      ? 'var(--surface-accent-soft)'
                      : 'var(--surface-sunken)',
                  border: s.active ? '2px solid var(--accent)' : 'none',
                }}
              >
                {s.done ? (
                  <Icon name="check" size={15} stroke={3} color="#fff" />
                ) : (
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: s.active ? 'var(--accent-press)' : 'var(--stone-400)',
                      display: 'block',
                    }}
                  />
                )}
              </div>
              {i < steps.length - 1 && (
                <div
                  style={{
                    width: 2,
                    height: 30,
                    background: s.done ? 'var(--brand)' : 'var(--border-default)',
                  }}
                />
              )}
            </div>

            {/* Label column */}
            <div style={{ paddingBottom: 18 }}>
              <div
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: 15,
                  fontWeight: 600,
                  color: s.done || s.active ? 'var(--text-strong)' : 'var(--text-subtle)',
                }}
              >
                {s.label}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  color: 'var(--text-subtle)',
                  marginTop: 2,
                }}
              >
                {s.sub}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Email notification banner */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 14px',
          background: 'var(--surface-brand-soft)',
          borderRadius: 12,
          marginBottom: 16,
        }}
      >
        <Icon name="mail" size={18} color="var(--brand-strong)" />
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 13.5,
            color: 'var(--brand-strong)',
          }}
        >
          {email ? (
            <>
              We&apos;ll notify <strong>{email}</strong>
            </>
          ) : (
            "We’ll email you when your request is reviewed."
          )}
        </span>
      </div>

      {/* Back to sign in */}
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

export default function PendingPage() {
  return (
    <React.Suspense fallback={<div style={{ width: '100%', maxWidth: 420 }} />}>
      <PendingContent />
    </React.Suspense>
  );
}
