'use client';

import React from 'react';
import { Icon } from '@/src/components/ui/Icon';

/**
 * A mobile bottom-nav button that toggles library selection mode
 * by dispatching the `tmn:study-select-toggle` CustomEvent.
 * Rendered only on the library tab (inside MobileShell when active === 'library').
 */
export function StudySelectNavButton() {
  function handleClick() {
    window.dispatchEvent(new CustomEvent('tmn:study-select-toggle'));
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Select notes to generate study material"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 56,
        height: 56,
        borderRadius: '50%',
        background: 'var(--surface-card)',
        border: '1px solid var(--border-subtle)',
        boxShadow: '0 8px 20px rgba(0,0,0,0.10)',
        cursor: 'pointer',
        padding: 0,
      }}
    >
      <Icon name="sparkles" size={24} color="var(--brand-strong)" />
    </button>
  );
}

StudySelectNavButton.displayName = 'StudySelectNavButton';
