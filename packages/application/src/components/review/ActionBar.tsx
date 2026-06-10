'use client';

import React from 'react';

export interface ActionBarProps {
  children?: React.ReactNode;
}

/**
 * Sticky bottom action bar — translucent surface-card bg, blur, top border.
 * Stays above the mobile keyboard via `position: sticky; bottom: 0`.
 * Padding-bottom respects the safe-area inset for notched devices.
 */
export function ActionBar({ children }: ActionBarProps) {
  return (
    <div className="tmn-action-bar">
      {children}
    </div>
  );
}

ActionBar.displayName = 'ActionBar';
