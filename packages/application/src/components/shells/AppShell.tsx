import React from 'react';
import { MobileShell } from './MobileShell';
import { DesktopShell } from './DesktopShell';
import type { MobileShellProps } from './MobileShell';

export interface AppShellProps {
  /** Active nav item id. Mobile shell only supports 'library' | 'search' | 'review' | 'profile';
   *  admin-only ids (pending, members, invites) default to no mobile highlight. */
  active?: string;
  title?: string;
  eyebrow?: string;
  actions?: React.ReactNode;
  isAdmin?: boolean;
  pendingCount?: number;
  search?: string;
  userName?: string;
  /** FAB rendered above the mobile bottom nav (ignored on desktop). */
  fab?: React.ReactNode;
  children: React.ReactNode;
}

/** Map a desktop-side active id to the mobile nav union (or undefined when there is no match). */
function toMobileActive(active: string | undefined): MobileShellProps['active'] {
  if (
    active === 'library' ||
    active === 'search' ||
    active === 'review' ||
    active === 'profile'
  ) {
    return active;
  }
  return undefined;
}

/**
 * AppShell — responsive wrapper.
 *
 * Renders MobileShell (visible below md) and DesktopShell (visible at md+)
 * side by side using Tailwind responsive utilities. No JS viewport detection
 * is used, which avoids hydration mismatches in Server Components.
 *
 * Both shells receive `children`; only one is visible at a time via CSS.
 */
export function AppShell({
  active,
  title,
  eyebrow,
  actions,
  isAdmin = false,
  pendingCount,
  search,
  userName,
  fab,
  children,
}: AppShellProps) {
  return (
    <>
      {/* Mobile: visible below md */}
      <div className="md:hidden h-full">
        <MobileShell active={toMobileActive(active)} fab={fab}>
          {children}
        </MobileShell>
      </div>

      {/* Desktop: visible at md and above */}
      <div className="hidden md:flex h-full">
        <DesktopShell
          active={active}
          title={title}
          eyebrow={eyebrow}
          actions={actions}
          isAdmin={isAdmin}
          pendingCount={pendingCount}
          search={search}
          userName={userName}
        >
          {children}
        </DesktopShell>
      </div>
    </>
  );
}

AppShell.displayName = 'AppShell';
