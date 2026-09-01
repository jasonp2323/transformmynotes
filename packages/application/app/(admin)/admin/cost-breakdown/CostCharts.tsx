'use client';

import React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  BarChart,
  Bar,
  Cell,
} from 'recharts';
import { formatUSD } from '@/src/lib/cost-format';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TrendPoint {
  day: string;
  aiUsd: number;
  storageUsd: number;
  usd: number;
  inputTokens: number;
  outputTokens: number;
  calls: number;
  bytes: number;
}

export interface CostRow {
  key: string;
  inputTokens: number;
  outputTokens: number;
  calls: number;
  usd: number;
  unpriced: boolean;
  name?: string; // for group rows
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CHART_COLORS = [
  'var(--brand-500, #6366f1)',
  'var(--accent-500, #8b5cf6)',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#3b82f6',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#84cc16',
  '#06b6d4',
  '#a855f7',
];

function usdTickFormatter(value: number): string {
  if (value === 0) return '$0';
  if (value >= 1) return `$${value.toFixed(0)}`;
  return `$${value.toFixed(2)}`;
}

interface TrendTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}

function TrendTooltipContent({ active, payload, label }: TrendTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div
      style={{
        background: 'var(--surface-raised, #fff)',
        border: '1px solid var(--border-subtle, #e5e7eb)',
        borderRadius: 8,
        padding: '10px 14px',
        fontSize: 13,
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--text-strong)' }}>
        {label}
      </div>
      {payload.map((p) => (
        <div
          key={p.name}
          style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}
        >
          <span
            style={{
              display: 'inline-block',
              width: 10,
              height: 10,
              borderRadius: 2,
              background: p.color,
              flexShrink: 0,
            }}
          />
          <span style={{ color: 'var(--text-muted)' }}>{p.name}:</span>
          <span style={{ fontWeight: 600, color: 'var(--text-strong)' }}>
            {formatUSD(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

interface BreakdownTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}

function BreakdownTooltipContent({ active, payload, label }: BreakdownTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0];
  return (
    <div
      style={{
        background: 'var(--surface-raised, #fff)',
        border: '1px solid var(--border-subtle, #e5e7eb)',
        borderRadius: 8,
        padding: '10px 14px',
        fontSize: 13,
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 4, color: 'var(--text-strong)' }}>
        {label}
      </div>
      {item && (
        <div style={{ color: 'var(--text-muted)' }}>
          Cost:{' '}
          <span style={{ fontWeight: 600, color: 'var(--text-strong)' }}>
            {formatUSD(item.value)}
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TrendChart
// ---------------------------------------------------------------------------

interface TrendChartProps {
  data: TrendPoint[];
}

export function TrendChart({ data }: TrendChartProps) {
  if (data.length === 0) {
    return (
      <div
        style={{
          height: 220,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 13.5,
          color: 'var(--text-subtle)',
        }}
      >
        No trend data for this period.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gradAi" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--brand-500, #6366f1)" stopOpacity={0.25} />
            <stop offset="95%" stopColor="var(--brand-500, #6366f1)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradStorage" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle, #e5e7eb)" vertical={false} />
        <XAxis
          dataKey="day"
          tick={{ fontSize: 11.5, fill: 'var(--text-subtle, #6b7280)' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: string) => v.slice(5)} // show MM-DD
        />
        <YAxis
          tick={{ fontSize: 11.5, fill: 'var(--text-subtle, #6b7280)' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={usdTickFormatter}
          width={54}
        />
        <Tooltip content={<TrendTooltipContent />} />
        <Legend
          iconType="square"
          wrapperStyle={{ fontSize: 12.5, paddingTop: 8 }}
        />
        <Area
          type="monotone"
          dataKey="aiUsd"
          name="AI cost"
          stroke="var(--brand-500, #6366f1)"
          strokeWidth={2}
          fill="url(#gradAi)"
          dot={false}
          activeDot={{ r: 4 }}
        />
        <Area
          type="monotone"
          dataKey="storageUsd"
          name="Storage cost"
          stroke="#10b981"
          strokeWidth={2}
          fill="url(#gradStorage)"
          dot={false}
          activeDot={{ r: 4 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// BreakdownChart
// ---------------------------------------------------------------------------

interface BreakdownChartProps {
  rows: CostRow[];
  dimension: 'model' | 'feature' | 'group';
}

const TOP_N = 12;

export function BreakdownChart({ rows, dimension }: BreakdownChartProps) {
  const sorted = [...rows].sort((a, b) => b.usd - a.usd).slice(0, TOP_N);

  const chartData = sorted.map((r) => ({
    label: dimension === 'group' ? (r.name ?? r.key) : r.key,
    usd: r.usd,
  }));

  if (chartData.length === 0) {
    return (
      <div
        style={{
          height: 220,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 13.5,
          color: 'var(--text-subtle)',
        }}
      >
        No breakdown data for this period.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--border-subtle, #e5e7eb)"
          horizontal={false}
        />
        <XAxis
          type="number"
          tick={{ fontSize: 11.5, fill: 'var(--text-subtle, #6b7280)' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={usdTickFormatter}
        />
        <YAxis
          type="category"
          dataKey="label"
          tick={{ fontSize: 11.5, fill: 'var(--text-subtle, #6b7280)' }}
          tickLine={false}
          axisLine={false}
          width={110}
        />
        <Tooltip content={<BreakdownTooltipContent />} />
        <Bar dataKey="usd" name="Cost" radius={[0, 4, 4, 0]}>
          {chartData.map((_entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={CHART_COLORS[index % CHART_COLORS.length]}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
