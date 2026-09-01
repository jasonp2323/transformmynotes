'use client';

import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';
import type { DaySnapshot } from '../types';
import { formatChartDate, pctOrNull } from '../utils';

interface RetentionEaseChartProps {
  days: DaySnapshot[];
}

export function RetentionEaseChart({ days }: RetentionEaseChartProps) {
  const data = days.map((d) => ({
    date: formatChartDate(d.date),
    retention: pctOrNull(d.retentionRate),
  }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
          tickLine={false}
          axisLine={false}
          domain={[0, 100]}
          tickFormatter={(v: number) => `${v}%`}
        />
        <Tooltip
          contentStyle={{
            background: 'var(--surface-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 8,
            fontSize: 13,
          }}
          labelStyle={{ color: 'var(--text-strong)', fontWeight: 600 }}
          itemStyle={{ color: 'var(--text-default)' }}
          formatter={(value, name) =>
            value == null ? ['—', name] : [`${value}%`, name]
          }
        />
        <Legend
          iconType="plainline"
          wrapperStyle={{ fontSize: 12, color: 'var(--text-muted)', paddingTop: 4 }}
        />
        <Line
          type="monotone"
          dataKey="retention"
          name="Retention"
          stroke="var(--accent)"
          strokeWidth={2}
          dot={false}
          connectNulls={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

RetentionEaseChart.displayName = 'RetentionEaseChart';
