'use client';

import React from 'react';
import type { DaySnapshot } from '../types';

interface ActivityCalendarProps {
  days: DaySnapshot[];
}

/**
 * Simple activity heatmap: shows one cell per day, coloured by activity level.
 * Active = reviews > 0. We show the last N days in a week-column grid.
 */
export function ActivityCalendar({ days }: ActivityCalendarProps) {
  // Bin by activity level for colour intensity
  function intensityClass(d: DaySnapshot): string {
    if (d.reviews === 0 && d.notesCreated === 0 && d.quizAttempts === 0) return 'progress-cal__cell--none';
    if (d.reviews < 5) return 'progress-cal__cell--low';
    if (d.reviews < 20) return 'progress-cal__cell--mid';
    return 'progress-cal__cell--high';
  }

  return (
    <div
      className="progress-cal"
      role="img"
      aria-label="Activity calendar"
    >
      <div className="progress-cal__grid">
        {days.map((d) => (
          <div
            key={d.date}
            className={`progress-cal__cell ${intensityClass(d)}`}
            title={`${d.date}: ${d.reviews} review${d.reviews === 1 ? '' : 's'}`}
          />
        ))}
      </div>
      <div className="progress-cal__legend">
        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Less</span>
        <div className="progress-cal__cell progress-cal__cell--none progress-cal__cell--sm" />
        <div className="progress-cal__cell progress-cal__cell--low  progress-cal__cell--sm" />
        <div className="progress-cal__cell progress-cal__cell--mid  progress-cal__cell--sm" />
        <div className="progress-cal__cell progress-cal__cell--high progress-cal__cell--sm" />
        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>More</span>
      </div>
    </div>
  );
}

ActivityCalendar.displayName = 'ActivityCalendar';
