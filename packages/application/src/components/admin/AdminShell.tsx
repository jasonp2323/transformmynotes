'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { DesktopShell } from '@/src/components/shells';
import { useAdminShell } from './AdminShellContext';
import { adminActiveFromPath } from './adminActive';

export interface AdminShellProps {
  title?: string;
  eyebrow?: string;
  actions?: React.ReactNode;
  search?: string;
  active?: string;
  children: React.ReactNode;
}

/**
 * Client wrapper used by all admin pages.
 * Pulls identity from AdminShellContext and derives the active nav item
 * from the current pathname (unless overridden via the `active` prop).
 */
export function AdminShell({
  title,
  eyebrow = 'Admin',
  actions,
  search,
  active: activeProp,
  children,
}: AdminShellProps) {
  const { userName, isAdmin } = useAdminShell();
  const pathname = usePathname();
  const active = activeProp ?? adminActiveFromPath(pathname) ?? undefined;

  return (
    <DesktopShell
      userName={userName}
      isAdmin={isAdmin}
      active={active}
      title={title}
      eyebrow={eyebrow}
      actions={actions}
      search={search}
    >
      {children}
    </DesktopShell>
  );
}

AdminShell.displayName = 'AdminShell';
