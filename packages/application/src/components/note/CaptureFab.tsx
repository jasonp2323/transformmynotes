import React from 'react';
import { Icon } from '@/src/components/ui';

/**
 * CaptureFab — gradient circular floating action button that links to /capture.
 * Rendered server-side as a plain <a> for keyboard-accessibility and SSR.
 * The AppShell `fab` slot handles positioning above the mobile bottom nav.
 */
export function CaptureFab() {
  return (
    <a
      href="/capture"
      aria-label="Capture note"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 60,
        height: 60,
        borderRadius: '50%',
        background: 'var(--gradient-transform)',
        boxShadow: '0 10px 26px rgba(48,127,112,0.4)',
        color: '#fff',
        textDecoration: 'none',
        cursor: 'pointer',
      }}
    >
      <Icon name="plus" size={28} color="#fff" />
    </a>
  );
}

CaptureFab.displayName = 'CaptureFab';
