'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { DesktopShell } from '@/src/components/shells';
import { MobileAdminShell } from './MobileAdminShell';
import { useAdminShell } from './AdminShellContext';
import { adminActiveFromPath } from './adminActive';

export interface AdminShellProps {
  title?: string;
  eyebrow?: string;
  actions?: React.ReactNode;
  search?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  active?: string;
  children: React.ReactNode;
}

/**
 * Client wrapper used by all admin pages.
 * Pulls identity from AdminShellContext and derives the active nav item
 * from the current pathname (unless overridden via the `active` prop).
 *
 * Renders MobileAdminShell (visible below md) and DesktopShell (visible at md+)
 * side by side using Tailwind responsive utilities.
 */
export function AdminShell({
  title,
  eyebrow = 'Admin',
  actions,
  search,
  searchValue,
  onSearchChange,
  active: activeProp,
  children,
}: AdminShellProps) {
  const { userName, isAdmin, pendingCount } = useAdminShell();
  const pathname = usePathname();
  const active = activeProp ?? adminActiveFromPath(pathname) ?? undefined;

  return (
    <>
      {/* Mobile: visible below md */}
      <div className="md:hidden h-full">
        <MobileAdminShell
          title={title}
          eyebrow={eyebrow}
          actions={actions}
          userName={userName}
          isAdmin={isAdmin}
          pendingCount={pendingCount}
        >
          {children}
        </MobileAdminShell>
      </div>

      {/* Desktop: visible at md and above */}
      <div className="hidden md:flex h-full">
        <DesktopShell
          userName={userName}
          isAdmin={isAdmin}
          pendingCount={pendingCount}
          active={active}
          title={title}
          eyebrow={eyebrow}
          actions={actions}
          search={search}
          searchValue={searchValue}
          onSearchChange={onSearchChange}
        >
          {children}
        </DesktopShell>
      </div>
    </>
  );
}

AdminShell.displayName = 'AdminShell';
