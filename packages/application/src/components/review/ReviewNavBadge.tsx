'use client';

import React, { useState, useEffect } from 'react';

export interface ReviewNavBadgeProps {
  variant: 'mobile' | 'desktop';
}

/**
 * Live due-count badge for the Review nav item.
 *
 * Fetches `GET /api/cards/due-count` on mount (HTTP cache deduplicates
 * repeated calls — the endpoint sends `Cache-Control: private, max-age=60`).
 * Renders nothing when count <= 0.  Caps display at 99+.
 */
export function ReviewNavBadge({ variant }: ReviewNavBadgeProps) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    fetch('/api/cards/due-count')
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json() as Promise<{ count: number }>;
      })
      .then((data) => {
        setCount(data.count);
      })
      .catch(() => {
        // Silently default to 0 — a missing count shouldn't break the nav.
        setCount(0);
      });
  }, []);

  if (count <= 0) return null;

  const label = count > 99 ? '99+' : String(count);

  if (variant === 'mobile') {
    return (
      <span
        className="tmn-bottomnav__badge"
        aria-label={`${count} cards due for review`}
      >
        {label}
      </span>
    );
  }

  // desktop: reuse sidebar pill styling with a live-pill modifier
  return (
    <span
      className="tmn-sidebar__pill tmn-sidebar__live-pill"
      aria-label={`${count} cards due for review`}
    >
      {label}
    </span>
  );
}

ReviewNavBadge.displayName = 'ReviewNavBadge';
