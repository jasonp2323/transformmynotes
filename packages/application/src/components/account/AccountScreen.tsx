'use client';

import React, { useState } from 'react';
import { signOut } from 'aws-amplify/auth';
import { useRouter } from 'next/navigation';
import { Avatar, Button, Icon } from '@/src/components/ui';
import { VoiceSelector } from '@/src/components/tts';

export interface AccountScreenProps {
  email: string;
  isAdmin: boolean;
}

export function AccountScreen({ email, isAdmin }: AccountScreenProps) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
    } catch {
      // best-effort — clear session regardless
    }
    // Authoritative session cookie clear is done server-side.
    await fetch('/api/auth/sign-out', { method: 'POST' });
    router.push('/login');
  }

  const roleLabel = isAdmin ? 'Admin' : 'Member';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 28,
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* Profile card */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
          padding: '32px 20px',
          borderRadius: 16,
          background: 'var(--surface-raised)',
          textAlign: 'center',
        }}
      >
        <Avatar name={email} size="lg" ring={false} />
        <div>
          <div
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 16,
              fontWeight: 600,
              color: 'var(--text-strong)',
              marginBottom: 4,
            }}
          >
            {email}
          </div>
          <div
            style={{
              display: 'inline-block',
              padding: '2px 10px',
              borderRadius: 999,
              background: isAdmin ? 'var(--accent-100, #ede9fe)' : 'var(--surface-subtle)',
              color: isAdmin ? 'var(--accent-700, #6d28d9)' : 'var(--text-muted)',
              fontFamily: 'var(--font-sans)',
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.04em',
            }}
          >
            {roleLabel}
          </div>
        </div>
      </div>

      {/* Pronunciation voice */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          padding: '20px',
          borderRadius: 16,
          background: 'var(--surface-raised)',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 15,
            fontWeight: 600,
            color: 'var(--text-strong)',
          }}
        >
          Pronunciation voice
        </div>
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
            color: 'var(--text-muted)',
          }}
        >
          Voice used when playing flashcard audio.
        </div>
        <VoiceSelector />
      </div>

      {/* Actions */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {/* Change password */}
        <a
          href="/forgot-password"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '14px 16px',
            borderRadius: 12,
            background: 'var(--surface-raised)',
            color: 'var(--text-strong)',
            textDecoration: 'none',
            fontFamily: 'var(--font-sans)',
            fontSize: 15,
            fontWeight: 500,
          }}
        >
          <Icon name="lock" size={18} />
          Change password
          <Icon name="chevron-right" size={16} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />
        </a>

        {/* Admin panel link — only for admins */}
        {isAdmin && (
          <a
            href="/admin"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '14px 16px',
              borderRadius: 12,
              background: 'var(--surface-raised)',
              color: 'var(--text-strong)',
              textDecoration: 'none',
              fontFamily: 'var(--font-sans)',
              fontSize: 15,
              fontWeight: 500,
            }}
          >
            <Icon name="shield" size={18} />
            Admin panel
            <Icon name="chevron-right" size={16} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />
          </a>
        )}

        {/* Sign out */}
        <Button
          variant="danger"
          fullWidth
          loading={signingOut}
          leftIcon={<Icon name="log-out" size={17} />}
          onClick={() => void handleSignOut()}
        >
          Sign out
        </Button>
      </div>
    </div>
  );
}

AccountScreen.displayName = 'AccountScreen';
