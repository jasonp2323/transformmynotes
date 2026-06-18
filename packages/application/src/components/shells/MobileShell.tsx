import React from 'react';
import { cn } from '@/src/lib/cn';
import { Icon } from '@/src/components/ui/Icon';
import { ReviewNavBadge } from '@/src/components/review/ReviewNavBadge';
import { LogoutButton } from './LogoutButton';
import { StudySelectNavButton } from '@/src/components/note/StudySelectNavButton';

export interface MobileShellProps {
  active?: 'library' | 'search' | 'review' | 'study' | 'sources' | 'profile';
  fab?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

interface BottomNavItem {
  id: 'library' | 'search' | 'review' | 'study' | 'sources' | 'profile';
  icon: string;
  label: string;
  href: string;
}

const NAV_ITEMS: BottomNavItem[] = [
  { id: 'library', icon: 'book-open', label: 'Library', href: '/dashboard' },
  { id: 'search',  icon: 'search',    label: 'Search',  href: '/search' },
  { id: 'review',  icon: 'layers',         label: 'Review',  href: '/review' },
  { id: 'study',   icon: 'graduation-cap', label: 'Study',   href: '/study' },
  { id: 'sources', icon: 'file-text',      label: 'Sources', href: '/sources' },
  { id: 'profile', icon: 'user',           label: 'You',     href: '/account' },
];

export function MobileShell({ active, fab, children, className }: MobileShellProps) {
  return (
    <div className={cn('tmn-shell tmn-shell--mobile', className)}>
      {/* Skip navigation link — visually hidden until focused */}
      <a href="#main-content" className="tmn-skip-nav">Skip to main content</a>

      {/* scrollable content */}
      <main
        id="main-content"
        className={cn('tmn-shell__content tmn-scroll', (fab != null || active === 'library') && 'tmn-shell__content--actions')}
      >
        {children}
      </main>

      {/* FAB slot — rendered when a fab is provided or on the library tab */}
      {(fab != null || active === 'library') && (
        <div className="tmn-shell__fab" aria-label="Quick actions">
          {fab}
          {active === 'library' && <StudySelectNavButton />}
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
              <span className="tmn-bottomnav__icon-wrap">
                <Icon
                  name={item.icon}
                  size={23}
                  stroke={isActive ? 2.4 : 2}
                />
                {item.id === 'review' && <ReviewNavBadge variant="mobile" />}
              </span>
              <span className="tmn-bottomnav__label">{item.label}</span>
            </a>
          );
        })}
        <div className="tmn-bottomnav__logout">
          <LogoutButton />
        </div>
      </nav>
    </div>
  );
}

MobileShell.displayName = 'MobileShell';
