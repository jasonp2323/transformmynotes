'use client';

import React from 'react';
import { signOut } from 'aws-amplify/auth';
import { useRouter } from 'next/navigation';
import { Icon } from '@/src/components/ui/Icon';

export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    try {
      await signOut();
    } catch {
      // Proceed with cleanup even if signOut fails
    }
    document.cookie = 'CognitoIdToken=; path=/; max-age=0; samesite=lax';
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
