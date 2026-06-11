import React from 'react';
import { cn } from '@/src/lib/cn';
import { Icon } from '@/src/components/ui/Icon';

export interface MobileShellProps {
  active?: 'library' | 'search' | 'review' | 'profile';
  fab?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

interface BottomNavItem {
  id: 'library' | 'search' | 'review' | 'profile';
  icon: string;
  label: string;
  href: string;
}

const NAV_ITEMS: BottomNavItem[] = [
  { id: 'library', icon: 'book-open', label: 'Library', href: '/dashboard' },
  { id: 'search',  icon: 'search',    label: 'Search',  href: '/search' },
  { id: 'review',  icon: 'layers',    label: 'Review',  href: '/review' },
  { id: 'profile', icon: 'user',      label: 'You',     href: '/profile' },
];

export function MobileShell({ active, fab, children, className }: MobileShellProps) {
  return (
    <div className={cn('tmn-shell tmn-shell--mobile', className)}>
      {/* scrollable content */}
      <div className="tmn-shell__content tmn-scroll">
        {children}
      </div>

      {/* FAB slot — only rendered when a node is provided */}
      {fab != null && (
        <div className="tmn-shell__fab" aria-label="Quick action">
          {fab}
        </div>
      )}

      {/* bottom navigation */}
      <nav className="tmn-bottomnav" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => {
          const isActive = item.id === active;
          return (
            <a
              key={item.id}
              href={item.href}
              className={cn('tmn-bottomnav__item', isActive && 'tmn-bottomnav__item--active')}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon
                name={item.icon}
                size={23}
                stroke={isActive ? 2.4 : 2}
              />
              <span className="tmn-bottomnav__label">{item.label}</span>
            </a>
          );
        })}
      </nav>
    </div>
  );
}

MobileShell.displayName = 'MobileShell';
