'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AdminShell, EmptyPanel } from '@/src/components/admin';
import { Badge, Card, Icon, Input, SegmentedControl } from '@/src/components/ui';
import { formatUSD, formatTokens, formatNumber } from '@/src/lib/cost-format';
import { TrendChart, BreakdownChart } from './CostCharts';
import type { TrendPoint, CostRow } from './CostCharts';
import { UserCostTable } from './UserCostTable';
import type { UserCostRow } from './UserCostTable';
import { PriceBookEditor } from './PriceBookEditor';
import type { PriceBook } from './PriceBookEditor';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SummaryTotals {
  ai: {
    inputTokens: number;
    outputTokens: number;
    calls: number;
    usd: number;
    unpriced: boolean;
  };
  storage: {
    avgBytes: number;
    gbMonths: number;
    usd: number;
    users: number;
  };
  usd: number;
}

interface SummaryResponse {
  ok: boolean;
  range: { from: string; to: string; days: number };
  totals: SummaryTotals;
  byModel: CostRow[];
  byFeature: CostRow[];
  byGroup: Array<CostRow & { name: string }>;
  trend: TrendPoint[];
  unpricedModels: string[];
  priceUpdatedAt: string | null;
}

interface UsersResponse {
  ok: boolean;
  range: { from: string; to: string; days: number };
  users: UserCostRow[];
}

interface PricingResponse {
  ok: boolean;
  priceBook: PriceBook;
  updatedAt: string | null;
  updatedBy: string | null;
  seeded: boolean;
  defaults: PriceBook;
}

type Dimension = 'model' | 'feature' | 'group';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Section heading
// ---------------------------------------------------------------------------

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: '0.07em',
        textTransform: 'uppercase',
        color: 'var(--text-subtle)',
        marginBottom: 14,
      }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary card
// ---------------------------------------------------------------------------

interface SummaryCardProps {
  icon: string;
  label: string;
  primary: string;
  secondary?: string;
  warning?: boolean;
  warningNote?: string;
}

function SummaryCard({
  icon,
  label,
  primary,
  secondary,
  warning,
  warningNote,
}: SummaryCardProps) {
  return (
    <Card
      padded
      style={{
        flex: '1 1 180px',
        minWidth: 160,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Icon name={icon} size={16} style={{ color: 'var(--text-subtle)' }} />
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--text-subtle)',
          }}
        >
          {label}
        </span>
      </div>
      <div
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: 'var(--text-strong)',
          fontFamily: 'var(--font-mono)',
          marginBottom: secondary ? 4 : 0,
        }}
      >
        {primary}
      </div>
      {secondary && (
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{secondary}</div>
      )}
      {warning && warningNote && (
        <div style={{ marginTop: 8 }}>
          <Badge tone="warning" dot>
            {warningNote}
          </Badge>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const DIMENSION_OPTIONS: { value: Dimension; label: string }[] = [
  { value: 'model', label: 'By model' },
  { value: 'feature', label: 'By feature' },
  { value: 'group', label: 'By group' },
];

export default function CostBreakdownPage() {
  // ── AdminShell search ────────────────────────────────────────────────────
  // We use the AdminShell search for the user table filter
  const [searchQuery, setSearchQuery] = useState('');

  // ── Date range (default: last 30 days) ───────────────────────────────────
  const [from, setFrom] = useState(() => daysAgo(29));
  const [to, setTo] = useState(() => today());

  // ── Dimension selector ───────────────────────────────────────────────────
  const [dimension, setDimension] = useState<Dimension>('model');

  // ── Remote data ──────────────────────────────────────────────────────────
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [users, setUsers] = useState<UserCostRow[] | null>(null);
  const [pricing, setPricing] = useState<PricingResponse | null>(null);

  // Loading states: true = initial load; 'reloading' = filter change
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(true);
  const [pricingLoading, setPricingLoading] = useState(true);

  const [summaryError, setSummaryError] = useState(false);
  const [usersError, setUsersError] = useState(false);
  const [pricingError, setPricingError] = useState(false);

  // ── Fetch summary ─────────────────────────────────────────────────────────

  const fetchSummary = useCallback(
    async (fromDate: string, toDate: string) => {
      setSummaryLoading(true);
      setSummaryError(false);
      try {
        const r = await fetch(
          `/api/admin/cost/summary?from=${fromDate}&to=${toDate}`,
        );
        const data = (await r.json()) as SummaryResponse;
        if (r.status === 403) {
          setSummaryError(true);
          return;
        }
        if (data.ok) {
          setSummary(data);
        } else {
          setSummaryError(true);
        }
      } catch {
        setSummaryError(true);
      } finally {
        setSummaryLoading(false);
      }
    },
    [],
  );

  const fetchUsers = useCallback(
    async (fromDate: string, toDate: string) => {
      setUsersLoading(true);
      setUsersError(false);
      try {
        const r = await fetch(
          `/api/admin/cost/users?from=${fromDate}&to=${toDate}`,
        );
        const data = (await r.json()) as UsersResponse;
        if (r.status === 403) {
          setUsersError(true);
          return;
        }
        if (data.ok) {
          setUsers(data.users);
        } else {
          setUsersError(true);
        }
      } catch {
        setUsersError(true);
      } finally {
        setUsersLoading(false);
      }
    },
    [],
  );

  const fetchPricing = useCallback(async () => {
    setPricingLoading(true);
    setPricingError(false);
    try {
      const r = await fetch('/api/admin/cost/pricing');
      const data = (await r.json()) as PricingResponse;
      if (r.status === 403) {
        setPricingError(true);
        return;
      }
      if (data.ok) {
        setPricing(data);
      } else {
        setPricingError(true);
      }
    } catch {
      setPricingError(true);
    } finally {
      setPricingLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    void fetchSummary(from, to);
    void fetchUsers(from, to);
    void fetchPricing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch summary+users when date range changes (not on initial mount)
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    void fetchSummary(from, to);
    void fetchUsers(from, to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  // ── After price-book save, refetch summary + users ───────────────────────
  const handlePriceSaved = useCallback(() => {
    void fetchSummary(from, to);
    void fetchUsers(from, to);
    void fetchPricing();
  }, [fetchSummary, fetchUsers, fetchPricing, from, to]);

  // ── Derived breakdown rows for the selected dimension ────────────────────
  const breakdownRows: CostRow[] = summary
    ? dimension === 'model'
      ? summary.byModel
      : dimension === 'feature'
      ? summary.byFeature
      : (summary.byGroup as CostRow[])
    : [];

  // ── Overall loading / error states ───────────────────────────────────────
  const initialLoading = summaryLoading && summary === null;
  const hasError = summaryError && summary === null;

  // ── Empty check: no usage data at all ────────────────────────────────────
  const isEmpty =
    !initialLoading &&
    !hasError &&
    summary !== null &&
    summary.totals.usd === 0 &&
    (users === null || users.length === 0);

  return (
    <AdminShell
      title="Cost Breakdown"
      search="Search users"
      searchValue={searchQuery}
      onSearchChange={setSearchQuery}
    >
      {/* Initial loading */}
      {initialLoading && (
        <Card padded style={{ textAlign: 'center', padding: '40px 24px' }}>
          <span style={{ fontSize: 14.5, color: 'var(--text-muted)' }}>Loading…</span>
        </Card>
      )}

      {/* Fetch error */}
      {hasError && (
        <EmptyPanel
          icon="cloud-off"
          title="Couldn't load cost data"
          sub="Please refresh to try again."
        />
      )}

      {/* Empty state */}
      {isEmpty && (
        <EmptyPanel
          icon="inbox"
          title="No usage recorded yet"
          sub="AI and storage cost data will appear here once users start generating content."
        />
      )}

      {/* Main content */}
      {!initialLoading && !hasError && !isEmpty && summary !== null && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ── Filter bar ────────────────────────────────────────────────── */}
          <Card padded>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 16,
                alignItems: 'flex-end',
              }}
            >
              {/* Date range */}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <Input
                  type="date"
                  label="From"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  style={{ minWidth: 140 }}
                />
                <Input
                  type="date"
                  label="To"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  style={{ minWidth: 140 }}
                />
              </div>

              {/* Dimension selector */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span
                  style={{
                    fontSize: 12.5,
                    fontWeight: 500,
                    color: 'var(--text-subtle)',
                  }}
                >
                  Breakdown
                </span>
                <SegmentedControl
                  options={DIMENSION_OPTIONS}
                  value={dimension}
                  onChange={(v) => setDimension(v as Dimension)}
                  ariaLabel="Cost breakdown dimension"
                />
              </div>

              {/* Loading indicator when refiltering */}
              {(summaryLoading || usersLoading) && summary !== null && (
                <span
                  style={{
                    fontSize: 12.5,
                    color: 'var(--text-subtle)',
                    alignSelf: 'center',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Icon name="rotate-ccw" size={13} />
                  Updating…
                </span>
              )}
            </div>

            {/* Date range info */}
            <div
              style={{
                marginTop: 10,
                fontSize: 12,
                color: 'var(--text-subtle)',
              }}
            >
              {summary.range.days} day{summary.range.days !== 1 ? 's' : ''}: {summary.range.from} → {summary.range.to}
            </div>
          </Card>

          {/* ── Summary cards ─────────────────────────────────────────────── */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <SummaryCard
              icon="dollar-sign"
              label="Total cost"
              primary={formatUSD(summary.totals.usd)}
            />
            <SummaryCard
              icon="bar-chart-3"
              label="AI cost"
              primary={formatUSD(summary.totals.ai.usd)}
              secondary={`${formatTokens(summary.totals.ai.inputTokens + summary.totals.ai.outputTokens)} tokens · ${formatNumber(summary.totals.ai.calls)} calls`}
              warning={summary.totals.ai.unpriced}
              warningNote={
                summary.unpricedModels.length > 0
                  ? `${summary.unpricedModels.length} unpriced model${summary.unpricedModels.length > 1 ? 's' : ''}`
                  : 'Unpriced usage'
              }
            />
            <SummaryCard
              icon="trending-up"
              label="Storage cost"
              primary={formatUSD(summary.totals.storage.usd)}
              secondary={`${summary.totals.storage.gbMonths.toFixed(3)} GB-months · ${formatNumber(summary.totals.storage.users)} users`}
            />
            <SummaryCard
              icon="pie-chart"
              label="API calls"
              primary={formatNumber(summary.totals.ai.calls)}
              secondary={`${formatTokens(summary.totals.ai.inputTokens)} in · ${formatTokens(summary.totals.ai.outputTokens)} out`}
            />
          </div>

          {/* Unpriced models warning */}
          {summary.unpricedModels.length > 0 && (
            <div
              role="alert"
              style={{
                background: 'var(--warning-50, #fffbeb)',
                border: '1px solid var(--warning-200, #fde68a)',
                borderRadius: 10,
                padding: '12px 18px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                fontSize: 13.5,
              }}
            >
              <Icon
                name="info"
                size={16}
                style={{ color: 'var(--warning-600, #d97706)', marginTop: 2, flexShrink: 0 }}
              />
              <div>
                <span
                  style={{ fontWeight: 600, color: 'var(--warning-700, #b45309)' }}
                >
                  Unpriced models:{' '}
                </span>
                <span style={{ color: 'var(--warning-700, #b45309)' }}>
                  {summary.unpricedModels.join(', ')}
                </span>
                <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>
                  — add price entries below to get accurate estimates.
                </span>
              </div>
            </div>
          )}

          {/* ── Trend chart ───────────────────────────────────────────────── */}
          <Card padded>
            <SectionHeading>Cost trend</SectionHeading>
            <TrendChart data={summary.trend} />
          </Card>

          {/* ── Breakdown chart ───────────────────────────────────────────── */}
          <Card padded>
            <SectionHeading>
              Cost breakdown{' '}
              {dimension === 'model'
                ? '— by model'
                : dimension === 'feature'
                ? '— by feature'
                : '— by group'}
            </SectionHeading>
            <BreakdownChart rows={breakdownRows} dimension={dimension} />
          </Card>

          {/* ── Per-user table ────────────────────────────────────────────── */}
          <Card padded={false}>
            <div style={{ padding: '16px 22px 12px' }}>
              <SectionHeading>Per-user cost</SectionHeading>
              {usersLoading && users === null && (
                <span style={{ fontSize: 13.5, color: 'var(--text-muted)' }}>
                  Loading users…
                </span>
              )}
              {usersError && (
                <span style={{ fontSize: 13.5, color: 'var(--danger-500)' }}>
                  Failed to load per-user data.
                </span>
              )}
            </div>
            {users !== null && !usersError && (
              <UserCostTable users={users} filterQuery={searchQuery} />
            )}
          </Card>

          {/* ── Price book editor ─────────────────────────────────────────── */}
          {pricingLoading && pricing === null && (
            <Card padded style={{ textAlign: 'center', padding: '28px 24px' }}>
              <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>
                Loading price book…
              </span>
            </Card>
          )}
          {pricingError && (
            <Card padded>
              <span style={{ fontSize: 13.5, color: 'var(--danger-500)' }}>
                Failed to load pricing data.
              </span>
            </Card>
          )}
          {pricing !== null && !pricingError && (
            <PriceBookEditor
              initial={pricing.priceBook}
              defaults={pricing.defaults}
              unpricedModels={summary.unpricedModels}
              onSaved={handlePriceSaved}
            />
          )}
        </div>
      )}
    </AdminShell>
  );
}
