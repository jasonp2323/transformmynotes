'use client';

import React, { useState, useEffect } from 'react';
import { HighlightText } from '@/src/components/ui';

export interface DueCountGreetingProps {
  userName: string;
}

/**
 * Greeting line on the dashboard that shows a live due-card count.
 *
 * Fetches `GET /api/cards/due-count` on mount and updates the count; defaults
 * to 0 on any error so the greeting is always rendered.
 */
export function DueCountGreeting({ userName }: DueCountGreetingProps) {
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
        // Silently default to 0 — a missing count shouldn't break the page.
        setCount(0);
      });
  }, []);

  const cardLabel = count === 1 ? '1 card' : `${count} cards`;

  return (
    <p
      style={{
        fontFamily: 'var(--font-serif)',
        fontSize: 16,
        color: 'var(--text-muted)',
        margin: '0 0 16px',
        padding: '0 0 0 2px',
      }}
    >
      Welcome back, {userName} —{' '}
      <HighlightText variant="teal">{cardLabel}</HighlightText> ready to review.
    </p>
  );
}

DueCountGreeting.displayName = 'DueCountGreeting';
