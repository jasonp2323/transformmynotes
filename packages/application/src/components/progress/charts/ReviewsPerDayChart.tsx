'use client';

import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import type { DaySnapshot } from '../types';
import { formatChartDate } from '../utils';

interface ReviewsPerDayChartProps {
  days: DaySnapshot[];
}

export function ReviewsPerDayChart({ days }: ReviewsPerDayChartProps) {
  const data = days.map((d) => ({
    date: formatChartDate(d.date),
    reviews: d.reviews,
  }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
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
          allowDecimals={false}
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
          formatter={(value: number) => [value, 'Reviews']}
        />
        <Bar dataKey="reviews" fill="var(--accent)" radius={[3, 3, 0, 0]} maxBarSize={24} />
      </BarChart>
    </ResponsiveContainer>
  );
}

ReviewsPerDayChart.displayName = 'ReviewsPerDayChart';
