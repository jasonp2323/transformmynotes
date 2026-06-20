'use client';

import React, { useState, useEffect, useRef } from 'react';
import { SegmentedControl } from '@/src/components/ui/SegmentedControl';
import { Icon } from '@/src/components/ui/Icon';
import { ReviewsPerDayChart } from './charts/ReviewsPerDayChart';
import { QuizScoreTrendChart } from './charts/QuizScoreTrendChart';
import { RetentionEaseChart } from './charts/RetentionEaseChart';
import { ActivityCalendar } from './charts/ActivityCalendar';
import { formatPct, isEmptyTotals } from './utils';
import type { ProgressResponse, RangeOption } from './types';

// ── Skeletons ─────────────────────────────────────────────────────────────────

function StatCardSkeleton() {
  return (
    <div className="progress-stat" role="status" aria-label="Loading…">
      <div className="progress-skeleton__bar animate-pulse" style={{ width: '60%', marginBottom: 8 }} />
      <div className="progress-skeleton__bar animate-pulse" style={{ width: '40%', height: 28 }} />
    </div>
  );
}

function ChartSkeleton({ height = 200 }: { height?: number }) {
  return (
    <div
      className="animate-pulse"
      role="status"
      aria-label="Loading chart…"
      style={{
        height,
        borderRadius: 8,
        background: 'var(--surface-sunken)',
      }}
    />
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="progress-empty">
      <div className="progress-empty__icon">
        <Icon name="trending-up" size={48} />
      </div>
      <h2 className="progress-empty__title">Start studying to see your progress</h2>
      <p className="progress-empty__body">
        Your study history, streaks, retention rate, and quiz scores will appear here as you
        review flashcards and take quizzes. History accumulates from now forward — no
        backfill of past activity.
      </p>
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
}

function StatCard({ label, value, sub }: StatCardProps) {
  return (
    <div className="progress-stat">
      <div className="progress-stat__label">{label}</div>
      <div className="progress-stat__value">{value}</div>
      {sub && <div className="progress-stat__sub">{sub}</div>}
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="progress-section">
      <h3 className="progress-section__title">{title}</h3>
      <div className="progress-section__card">{children}</div>
    </div>
  );
}

// ── Range options ─────────────────────────────────────────────────────────────

const RANGE_OPTIONS = [
  { value: '7d',   label: '7d' },
  { value: '30d',  label: '30d' },
  { value: '90d',  label: '90d' },
  { value: '365d', label: '1y' },
];

// ── Main screen ───────────────────────────────────────────────────────────────

export function ProgressScreen() {
  const [range, setRange] = useState<RangeOption>('30d');
  const [data, setData] = useState<ProgressResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    fetch(`/api/progress?range=${range}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json() as Promise<ProgressResponse>;
      })
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === 'AbortError') return;
        setError('Could not load progress data. Please try again.');
        setLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [range]);

  const isEmpty = data ? isEmptyTotals(data.totals, data.days) : false;

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-3xl mx-auto">
      {/* Range switcher header */}
      <div className="progress-header">
        <p style={{ margin: 0, fontSize: 14, color: 'var(--text-muted)', fontFamily: 'var(--font-sans)' }}>
          {loading ? 'Loading…' : error ? '' : `Showing ${range} of activity`}
        </p>
        <SegmentedControl
          options={RANGE_OPTIONS}
          value={range}
          onChange={(v) => setRange(v as RangeOption)}
          ariaLabel="Select time range"
        />
      </div>

      {/* Error state */}
      {error && (
        <div
          style={{
            background: 'var(--surface-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 12,
            padding: '16px 20px',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-sans)',
            fontSize: 14,
            marginBottom: 24,
          }}
          role="alert"
        >
          {error}
        </div>
      )}

      {/* Headline stat cards */}
      <div className="progress-stats">
        {loading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : data ? (
          <>
            <StatCard
              label="Current streak"
              value={`${data.profile.studyStreakDays}d`}
              sub={`Longest: ${data.profile.longestStreakDays}d`}
            />
            <StatCard
              label="Total reviews"
              value={data.profile.totalReviewsLifetime.toLocaleString()}
            />
            <StatCard
              label="Cards mastered"
              value={data.profile.totalCardsMastered.toLocaleString()}
            />
            <StatCard
              label="Avg quiz score"
              value={formatPct(data.totals.avgQuizScore)}
            />
          </>
        ) : null}
      </div>

      {/* Empty state — shown when no data yet */}
      {!loading && !error && data && isEmpty && <EmptyState />}

      {/* Charts — only shown when there is data */}
      {!loading && !error && data && !isEmpty && (
        <>
          <Section title="Reviews per day">
            <ReviewsPerDayChart days={data.days} />
          </Section>

          <Section title="Quiz score trend">
            <QuizScoreTrendChart days={data.days} />
          </Section>

          <Section title="Retention rate">
            <RetentionEaseChart days={data.days} />
          </Section>

          <Section title="Activity">
            <ActivityCalendar days={data.days} />
          </Section>
        </>
      )}

      {/* Skeleton charts while loading (first load) */}
      {loading && (
        <>
          <Section title="Reviews per day">
            <ChartSkeleton />
          </Section>
          <Section title="Quiz score trend">
            <ChartSkeleton />
          </Section>
          <Section title="Retention rate">
            <ChartSkeleton />
          </Section>
          <Section title="Activity">
            <ChartSkeleton height={120} />
          </Section>
        </>
      )}
    </div>
  );
}

ProgressScreen.displayName = 'ProgressScreen';
