import React from 'react';
import { cn } from '@/src/lib/cn';
import { Icon } from '@/src/components/ui/Icon';
import { Avatar } from '@/src/components/ui/Avatar';
import { Input } from '@/src/components/ui/Input';
import { ReviewNavBadge } from '@/src/components/review/ReviewNavBadge';
import { LogoutButton } from './LogoutButton';

export interface DesktopShellProps {
  active?: string;
  title?: string;
  eyebrow?: string;
  actions?: React.ReactNode;
  isAdmin?: boolean;
  pendingCount?: number;
  search?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  userName?: string;
  children: React.ReactNode;
}

interface NavItem {
  id: string;
  icon: string;
  label: string;
  count?: number;
  accent?: boolean;
  liveBadge?: boolean;
  href: string;
}

interface NavGroup {
  group: string;
  items: NavItem[];
}

const NOTEBOOK_GROUP: NavGroup = {
  group: 'Notebook',
  items: [
    { id: 'library', icon: 'book-open', label: 'Library',    href: '/dashboard' },
    { id: 'search',  icon: 'search',    label: 'Search',     href: '/search' },
    { id: 'review',  icon: 'layers',    label: 'Review deck', liveBadge: true, href: '/review' },
  ],
};

export function DesktopShell({
  active,
  title,
  eyebrow,
  actions,
  isAdmin = false,
  pendingCount,
  search = 'Search your notes',
  searchValue,
  onSearchChange,
  userName = 'You',
  children,
}: DesktopShellProps) {
  const adminGroup: NavGroup = {
    group: 'Admin',
    items: [
      {
        id: 'pending',
        icon: 'user-plus',
        label: 'Pending',
        ...(pendingCount != null && pendingCount > 0 ? { count: pendingCount } : {}),
        accent: true,
        href: '/admin/pending',
      },
      { id: 'members', icon: 'users',  label: 'Members', href: '/admin/members' },
      { id: 'invites', icon: 'ticket', label: 'Invites', href: '/admin/invites' },
    ],
  };
  const navGroups: NavGroup[] = isAdmin ? [NOTEBOOK_GROUP, adminGroup] : [NOTEBOOK_GROUP];

  const roleLabel = isAdmin ? 'Admin' : 'Member';

  return (
    <div className="tmn-shell tmn-shell--desktop">
      {/* Skip navigation link — visually hidden until focused */}
      <a href="#main-content" className="tmn-skip-nav">Skip to main content</a>

      {/* sidebar */}
      <aside className="tmn-sidebar" aria-label="Site navigation">
        {/* logo */}
        <div className="tmn-sidebar__logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/logo-mark.svg" width={30} height={30} alt="" />
          <span className="tmn-sidebar__wordmark">TransformMyNotes</span>
        </div>

        {/* grouped nav */}
        <nav className="tmn-sidebar__nav" aria-label="Main navigation">
          {navGroups.map((g) => (
            <div key={g.group} className="tmn-sidebar__group">
              <div className="tmn-sidebar__group-label">{g.group}</div>
              <div className="tmn-sidebar__group-items">
                {g.items.map((item) => {
                  const isActive = item.id === active;
                  return (
                    <a
                      key={item.id}
                      href={item.href}
                      className={cn(
                        'tmn-sidebar__item',
                        isActive && 'tmn-sidebar__item--active',
                      )}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      <Icon
                        name={item.icon}
                        size={19}
                        stroke={isActive ? 2.3 : 2}
                      />
                      <span className="tmn-sidebar__item-label">{item.label}</span>
                      {item.liveBadge
                        ? <ReviewNavBadge variant="desktop" />
                        : item.count != null && (
                          <span
                            className={cn(
                              'tmn-sidebar__pill',
                              item.accent && 'tmn-sidebar__pill--accent',
                              !item.accent && isActive && 'tmn-sidebar__pill--active',
                            )}
                          >
                            {item.count}
                          </span>
                        )
                      }
                    </a>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* footer */}
        <div className="tmn-sidebar__footer">
          <Avatar name={userName} size="sm" />
          <div className="tmn-sidebar__footer-info">
            <div className="tmn-sidebar__footer-name">{userName}</div>
            <div className="tmn-sidebar__footer-role">{roleLabel}</div>
          </div>
          <LogoutButton />
        </div>
      </aside>

      {/* main content area */}
      <main id="main-content" className="tmn-shell__main">
        {/* page header */}
        <header className="tmn-shell__header">
          <div className="tmn-shell__header-title">
            {eyebrow && (
              <div className="tmn-shell__eyebrow">{eyebrow}</div>
            )}
            {title && (
              <h1 className="tmn-shell__title">{title}</h1>
            )}
          </div>
          <div className="tmn-shell__search">
            <Input
              aria-label={search}
              leadingIcon={<Icon name="search" size={17} />}
              placeholder={search}
              {...(onSearchChange
                ? {
                    value: searchValue ?? '',
                    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                      onSearchChange(e.target.value),
                  }
                : {})}
            />
          </div>
          {actions && (
            <div className="tmn-shell__actions">{actions}</div>
          )}
        </header>

        {/* scrollable content */}
        <div className="tmn-shell__content tmn-scroll">
          {children}
        </div>
      </main>
    </div>
  );
}

DesktopShell.displayName = 'DesktopShell';
