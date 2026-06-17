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
      className="tmn-bottomnav__item"
      onClick={handleClick}
      aria-label="Select notes to generate study material"
      style={{ background: 'transparent', border: 'none', cursor: 'pointer', font: 'inherit' }}
    >
      <span className="tmn-bottomnav__icon-wrap">
        <Icon name="sparkles" size={23} stroke={2} />
      </span>
      <span className="tmn-bottomnav__label">Generate</span>
    </button>
  );
}

StudySelectNavButton.displayName = 'StudySelectNavButton';
