import React from 'react';

export interface AuthCardSkeletonProps {
  /** Short label for screen readers / muted caption. Default: "Loading…" */
  label?: string;
}

/**
 * Presentational skeleton that mirrors the shape of the login card.
 * Shown while the initial auth session check is in progress or while a
 * redirect is about to fire, so the user sees a branded placeholder instead
 * of a blank screen.
 */
export function AuthCardSkeleton({ label = 'Loading…' }: AuthCardSkeletonProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      style={{
        width: '100%',
        maxWidth: 420,
        borderRadius: 'var(--radius-xl)',
        background: 'var(--surface-card)',
        boxShadow: 'var(--shadow-lg)',
        overflow: 'hidden',
      }}
    >
      {/* Visually-hidden label for screen readers */}
      <span
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0,0,0,0)',
          whiteSpace: 'nowrap',
          borderWidth: 0,
        }}
      >
        {label}
      </span>

      {/* Hero band — same gradient + line overlay as the real login card */}
      <div
        style={{
          position: 'relative',
          background: 'var(--gradient-transform)',
          padding: '32px 30px 54px',
          overflow: 'hidden',
        }}
        aria-hidden="true"
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
        />
        {/* Logo placeholder + title placeholder */}
        <div style={{ position: 'relative' }}>
          {/* Logo mark placeholder */}
          <div
            className="animate-pulse"
            style={{
              width: 46,
              height: 46,
              borderRadius: 'var(--radius-md)',
              background: 'rgba(255,255,255,0.25)',
            }}
          />
          {/* Title line 1 */}
          <div
            className="animate-pulse"
            style={{
              marginTop: 24,
              height: 28,
              width: '75%',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(255,255,255,0.25)',
            }}
          />
          {/* Title line 2 */}
          <div
            className="animate-pulse"
            style={{
              marginTop: 10,
              height: 28,
              width: '55%',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(255,255,255,0.25)',
            }}
          />
        </div>
      </div>

      {/* Form area — matches the real card's rounded top overlap + padding */}
      <div
        style={{
          background: 'var(--surface-card)',
          borderRadius: '22px 22px 0 0',
          marginTop: -22,
          position: 'relative',
          padding: '26px 28px 32px',
        }}
        aria-hidden="true"
      >
        {/* Title bar (~40% width) */}
        <div
          className="animate-pulse"
          style={{
            height: 22,
            width: '40%',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--surface-sunken)',
            marginBottom: 20,
          }}
        />

        {/* First input placeholder (email) */}
        <div
          className="animate-pulse"
          style={{
            height: 44,
            width: '100%',
            borderRadius: 'var(--radius-md)',
            background: 'var(--surface-sunken)',
            marginBottom: 14,
          }}
        />

        {/* Second input placeholder (password) */}
        <div
          className="animate-pulse"
          style={{
            height: 44,
            width: '100%',
            borderRadius: 'var(--radius-md)',
            background: 'var(--surface-sunken)',
            marginBottom: 16,
          }}
        />

        {/* Button placeholder */}
        <div
          className="animate-pulse"
          style={{
            height: 52,
            width: '100%',
            borderRadius: 'var(--radius-pill)',
            background: 'var(--surface-sunken)',
          }}
        />

        {/* Muted status caption */}
        <p
          style={{
            marginTop: 14,
            fontSize: 13,
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-sans)',
            textAlign: 'center',
          }}
        >
          {label}
        </p>
      </div>
    </div>
  );
}
