'use client';

import React, { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { cn } from '@/src/lib/cn';
import { Icon } from '@/src/components/ui/Icon';
import { Avatar } from '@/src/components/ui/Avatar';
import { LogoutButton } from '@/src/components/shells/LogoutButton';
import { ReviewNavBadge } from '@/src/components/review/ReviewNavBadge';
import { adminActiveFromPath } from './adminActive';

export interface MobileAdminShellProps {
  title?: string;
  eyebrow?: string;
  actions?: React.ReactNode;
  userName?: string;
  isAdmin?: boolean;
  pendingCount?: number;
  children: React.ReactNode;
}

const NOTEBOOK_ITEMS = [
  { id: 'library',  icon: 'book-open',      label: 'Library',     href: '/dashboard' },
  { id: 'search',   icon: 'search',         label: 'Search',      href: '/search' },
  { id: 'review',   icon: 'layers',         label: 'Review deck', href: '/review', liveBadge: true },
  { id: 'study',    icon: 'graduation-cap', label: 'Study',       href: '/study' },
  { id: 'sources',  icon: 'file-text',      label: 'Sources',     href: '/sources' },
  { id: 'progress', icon: 'trending-up',    label: 'Progress',    href: '/progress' },
];

export function MobileAdminShell({
  title,
  eyebrow,
  actions,
  userName,
  isAdmin = false,
  pendingCount,
  children,
}: MobileAdminShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const activeAdmin = adminActiveFromPath(pathname);
  // Widen to string so the footer can compare against 'profile' without a type error
  const active: string | undefined = activeAdmin ?? (pathname.startsWith('/account') ? 'profile' : undefined);

  const adminItems = [
    {
      id: 'pending',
      icon: 'user-plus',
      label: 'Pending',
      href: '/admin/pending',
      count: pendingCount != null && pendingCount > 0 ? pendingCount : undefined,
      accent: true,
    },
    { id: 'members',        icon: 'users',      label: 'Members',        href: '/admin/members' },
    { id: 'invites',        icon: 'ticket',     label: 'Invites',        href: '/admin/invites' },
    { id: 'ai-settings',    icon: 'sliders',    label: 'AI Settings',    href: '/admin/ai-settings' },
    { id: 'cost-breakdown', icon: 'pie-chart',  label: 'Cost Breakdown', href: '/admin/cost-breakdown' },
  ];

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [drawerOpen]);

  // Focus the drawer when it opens
  useEffect(() => {
    if (drawerOpen) {
      drawerRef.current?.focus();
    }
  }, [drawerOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!drawerOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setDrawerOpen(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [drawerOpen]);

  return (
    <div className="tmn-shell tmn-shell--mobile">
      {/* Skip navigation link */}
      <a href="#main-content" className="tmn-skip-nav">Skip to main content</a>

      {/* Top app bar */}
      <div className="tmn-admin-topbar">
        <button
          className="tmn-admin-topbar__hamburger"
          aria-label="Open navigation"
          onClick={() => setDrawerOpen(true)}
        >
          <Icon name="menu" size={22} />
        </button>
        <div className="tmn-admin-topbar__title">
          {eyebrow && <span className="tmn-shell__eyebrow">{eyebrow}</span>}
          {title && <h1 className="tmn-shell__title">{title}</h1>}
        </div>
        {actions && <div className="tmn-shell__actions">{actions}</div>}
      </div>

      {/* Drawer overlay */}
      {drawerOpen && (
        <div
          className="tmn-admin-drawer__overlay"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Slide-in drawer */}
      <div
        className={cn('tmn-admin-drawer', drawerOpen && 'tmn-admin-drawer--open')}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        ref={drawerRef}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={-1}
      >
        {/* Logo row */}
        <div className="tmn-sidebar__logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/logo-mark.svg" width={28} height={28} alt="" />
          <span className="tmn-sidebar__wordmark">TransformMyNotes</span>
          <button
            className="tmn-admin-drawer__close"
            aria-label="Close navigation"
            onClick={() => setDrawerOpen(false)}
          >
            <Icon name="x" size={20} />
          </button>
        </div>

        {/* Nav */}
        <nav className="tmn-sidebar__nav" aria-label="Main navigation">
          {/* Notebook group */}
          <div className="tmn-sidebar__group">
            <div className="tmn-sidebar__group-label">Notebook</div>
            <div className="tmn-sidebar__group-items">
              {NOTEBOOK_ITEMS.map((item) => {
                const isActive = item.id === active;
                return (
                  <a
                    key={item.id}
                    href={item.href}
                    className={cn('tmn-sidebar__item', isActive && 'tmn-sidebar__item--active')}
                    aria-current={isActive ? 'page' : undefined}
                    onClick={() => setDrawerOpen(false)}
                  >
                    <Icon name={item.icon} size={19} stroke={isActive ? 2.3 : 2} />
                    <span className="tmn-sidebar__item-label">{item.label}</span>
                    {item.liveBadge && <ReviewNavBadge variant="desktop" />}
                  </a>
                );
              })}
            </div>
          </div>

          {/* Admin group */}
          {isAdmin && (
            <div className="tmn-sidebar__group">
              <div className="tmn-sidebar__group-label">Admin</div>
              <div className="tmn-sidebar__group-items">
                {adminItems.map((item) => {
                  const isActive = item.id === active;
                  return (
                    <a
                      key={item.id}
                      href={item.href}
                      className={cn('tmn-sidebar__item', isActive && 'tmn-sidebar__item--active')}
                      aria-current={isActive ? 'page' : undefined}
                      onClick={() => setDrawerOpen(false)}
                    >
                      <Icon name={item.icon} size={19} stroke={isActive ? 2.3 : 2} />
                      <span className="tmn-sidebar__item-label">{item.label}</span>
                      {item.count != null && (
                        <span
                          className={cn(
                            'tmn-sidebar__pill',
                            item.accent && 'tmn-sidebar__pill--accent',
                            !item.accent && isActive && 'tmn-sidebar__pill--active',
                          )}
                        >
                          {item.count}
                        </span>
                      )}
                    </a>
                  );
                })}
              </div>
            </div>
          )}
        </nav>

        {/* Footer */}
        <div className="tmn-sidebar__footer">
          <a
            href="/account"
            className={cn(
              'tmn-sidebar__footer-link',
              active === 'profile' && 'tmn-sidebar__footer-link--active',
            )}
          >
            <Avatar name={userName ?? 'You'} size="sm" />
            <div className="tmn-sidebar__footer-info">
              <div className="tmn-sidebar__footer-name">{userName}</div>
              <div className="tmn-sidebar__footer-role">{isAdmin ? 'Admin' : 'Member'}</div>
            </div>
          </a>
          <LogoutButton />
        </div>
      </div>

      {/* Scrollable content */}
      <main id="main-content" className="tmn-shell__content tmn-scroll">
        {children}
      </main>
    </div>
  );
}

MobileAdminShell.displayName = 'MobileAdminShell';
