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
        gap: 8,
        height: 52,
        paddingLeft: 18,
        paddingRight: 18,
        borderRadius: 999,
        background: 'var(--surface-card)',
        color: 'var(--text-strong)',
        border: '1px solid var(--border-subtle)',
        boxShadow: '0 8px 20px rgba(0,0,0,0.10)',
        cursor: 'pointer',
        font: 'inherit',
        fontFamily: 'var(--font-sans)',
        fontSize: 15,
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      <Icon name="sparkles" size={20} />
      Generate
    </button>
  );
}

StudySelectNavButton.displayName = 'StudySelectNavButton';
