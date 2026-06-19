import type { Metadata } from 'next';
import { ReloadButton } from './ReloadButton';

export const metadata: Metadata = {
  title: 'Offline — TransformMyNotes',
};

export default function OfflinePage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#FAF8F3',
        padding: '24px 16px',
        textAlign: 'center',
      }}
    >
      {/* Logo */}
      <img
        src="/assets/logo-mark.svg"
        alt="TransformMyNotes"
        width={72}
        height={72}
        style={{ marginBottom: '24px' }}
      />

      {/* Heading */}
      <h1
        style={{
          fontSize: '1.75rem',
          fontWeight: 700,
          color: '#1a1a1a',
          margin: '0 0 12px',
          lineHeight: 1.2,
        }}
      >
        You&rsquo;re offline
      </h1>

      {/* Message */}
      <p
        style={{
          fontSize: '1rem',
          color: '#555',
          maxWidth: '340px',
          margin: '0 0 32px',
          lineHeight: 1.6,
        }}
      >
        This page isn&rsquo;t available offline yet. Reconnect to pick up where
        you left off.
      </p>

      {/* Try again button */}
      <ReloadButton />

      {/* Fallback link for environments without JS */}
      <noscript>
        <a
          href="/dashboard"
          style={{
            marginTop: '16px',
            display: 'inline-block',
            color: '#16747e',
            textDecoration: 'underline',
            fontSize: '0.9rem',
          }}
        >
          Go to dashboard
        </a>
      </noscript>
    </div>
  );
}
