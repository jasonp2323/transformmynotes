'use client';

import React from 'react';
import { signOut } from 'aws-amplify/auth';
import { useRouter } from 'next/navigation';
import { Icon } from '@/src/components/ui/Icon';

export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    // Best-effort: clear any Amplify local state from the invite flow.
    try {
      await signOut();
    } catch {
      // Proceed with cleanup even if signOut fails
    }
    // Authoritative session cookie clear is done server-side.
    await fetch('/api/auth/sign-out', { method: 'POST' });
    router.push('/login');
  }

  return (
    <button
      onClick={handleLogout}
      className="tmn-sidebar__footer-logout"
      aria-label="Sign out"
      type="button"
    >
      <Icon name="log-out" size={17} />
    </button>
  );
}

LogoutButton.displayName = 'LogoutButton';
