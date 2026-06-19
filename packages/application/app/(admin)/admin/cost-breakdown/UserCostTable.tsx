'use client';

import React, { useState } from 'react';
import { Badge } from '@/src/components/ui';
import { formatUSD, formatTokens, formatNumber } from '@/src/lib/cost-format';
import { formatBytes } from '@/src/lib/sources-upload';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UserCostRow {
  sub: string;
  email: string;
  name: string;
  groupIds: string[];
  ai: {
    inputTokens: number;
    outputTokens: number;
    calls: number;
    usd: number;
    unpriced: boolean;
  };
  storage: {
    avgBytes: number;
    snapshotDays: number;
    gbMonths: number;
    usd: number;
  };
  usd: number;
}

// ---------------------------------------------------------------------------
// Grid layout
// ---------------------------------------------------------------------------

const COLS = '2.2fr 1fr 0.9fr 1.4fr 0.8fr 0.9fr 0.9fr';

type SortKey = 'usd' | 'aiUsd' | 'storageUsd' | 'calls' | 'inputTokens' | 'outputTokens';

function sortRows(rows: UserCostRow[], key: SortKey, asc: boolean): UserCostRow[] {
  return [...rows].sort((a, b) => {
    let av = 0;
    let bv = 0;
    switch (key) {
      case 'usd':
        av = a.usd; bv = b.usd; break;
      case 'aiUsd':
        av = a.ai.usd; bv = b.ai.usd; break;
      case 'storageUsd':
        av = a.storage.usd; bv = b.storage.usd; break;
      case 'calls':
        av = a.ai.calls; bv = b.ai.calls; break;
      case 'inputTokens':
        av = a.ai.inputTokens; bv = b.ai.inputTokens; break;
      case 'outputTokens':
        av = a.ai.outputTokens; bv = b.ai.outputTokens; break;
    }
    return asc ? av - bv : bv - av;
  });
}

// ---------------------------------------------------------------------------
// SortableHeader
// ---------------------------------------------------------------------------

interface SortableHeaderProps {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey;
  asc: boolean;
  onSort: (key: SortKey) => void;
  align?: 'left' | 'right';
}

function SortableHeader({
  label,
  sortKey,
  currentKey,
  asc,
  onSort,
  align = 'right',
}: SortableHeaderProps) {
  const active = currentKey === sortKey;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      style={{
        background: 'none',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 11.5,
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: active ? 'var(--brand-strong, #4f46e5)' : 'var(--text-subtle)',
        justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
        width: '100%',
      }}
    >
      {label}
      <span style={{ fontSize: 10, opacity: active ? 1 : 0.35 }}>
        {active ? (asc ? '▲' : '▼') : '▼'}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// UserCostTable
// ---------------------------------------------------------------------------

interface UserCostTableProps {
  users: UserCostRow[];
  filterQuery: string;
}

export function UserCostTable({ users, filterQuery }: UserCostTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('usd');
  const [sortAsc, setSortAsc] = useState(false);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortAsc((prev) => !prev);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const q = filterQuery.trim().toLowerCase();
  const filtered = q
    ? users.filter(
        (u) =>
          u.email.toLowerCase().includes(q) ||
          u.name.toLowerCase().includes(q),
      )
    : users;

  const sorted = sortRows(filtered, sortKey, sortAsc);

  if (users.length === 0) {
    return (
      <div
        style={{
          padding: '28px 22px',
          fontSize: 14,
          color: 'var(--text-subtle)',
          textAlign: 'center',
        }}
      >
        No per-user cost data for this period.
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      {/* Header */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: COLS,
          gap: 12,
          padding: '13px 22px',
          borderBottom: '1px solid var(--border-subtle)',
          minWidth: 780,
        }}
      >
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--text-subtle)',
          }}
        >
          User
        </span>
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--text-subtle)',
          }}
        >
          Groups
        </span>
        <SortableHeader
          label="AI USD"
          sortKey="aiUsd"
          currentKey={sortKey}
          asc={sortAsc}
          onSort={handleSort}
        />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 4,
            alignItems: 'end',
          }}
        >
          <SortableHeader
            label="Tokens in"
            sortKey="inputTokens"
            currentKey={sortKey}
            asc={sortAsc}
            onSort={handleSort}
          />
          <SortableHeader
            label="Tokens out"
            sortKey="outputTokens"
            currentKey={sortKey}
            asc={sortAsc}
            onSort={handleSort}
          />
        </div>
        <SortableHeader
          label="Calls"
          sortKey="calls"
          currentKey={sortKey}
          asc={sortAsc}
          onSort={handleSort}
        />
        <SortableHeader
          label="Storage USD"
          sortKey="storageUsd"
          currentKey={sortKey}
          asc={sortAsc}
          onSort={handleSort}
        />
        <SortableHeader
          label="Total USD"
          sortKey="usd"
          currentKey={sortKey}
          asc={sortAsc}
          onSort={handleSort}
        />
      </div>

      {/* Search-empty state */}
      {sorted.length === 0 && (
        <div
          style={{
            padding: '24px 22px',
            fontSize: 14,
            color: 'var(--text-subtle)',
            textAlign: 'center',
          }}
        >
          No users match your search.
        </div>
      )}

      {/* Data rows */}
      {sorted.map((u, idx) => {
        const displayName = u.name || u.email || u.sub.slice(0, 12) + '…';
        const displaySub =
          !u.name && !u.email ? null : u.email || u.sub.slice(0, 12) + '…';

        return (
          <div
            key={u.sub}
            style={{
              display: 'grid',
              gridTemplateColumns: COLS,
              gap: 12,
              padding: '13px 22px',
              alignItems: 'center',
              borderBottom:
                idx < sorted.length - 1
                  ? '1px solid var(--border-subtle)'
                  : 'none',
              minWidth: 780,
            }}
          >
            {/* User cell */}
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  flexWrap: 'wrap',
                }}
              >
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: 'var(--text-strong)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {displayName}
                </span>
                {u.ai.unpriced && (
                  <Badge tone="warning" dot>
                    Unpriced
                  </Badge>
                )}
              </div>
              {displaySub && (
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--text-subtle)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {displaySub}
                </div>
              )}
            </div>

            {/* Groups cell */}
            <div
              style={{
                fontSize: 12.5,
                color: 'var(--text-muted)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={u.groupIds.join(', ')}
            >
              {u.groupIds.length > 0 ? u.groupIds.join(', ') : '—'}
            </div>

            {/* AI USD */}
            <div
              style={{
                textAlign: 'right',
                fontFamily: 'var(--font-mono)',
                fontSize: 13.5,
                color: 'var(--text-strong)',
              }}
            >
              {formatUSD(u.ai.usd)}
            </div>

            {/* Tokens in / out */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 4,
              }}
            >
              <div
                style={{
                  textAlign: 'right',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12.5,
                  color: 'var(--text-muted)',
                }}
              >
                {formatTokens(u.ai.inputTokens)}
              </div>
              <div
                style={{
                  textAlign: 'right',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12.5,
                  color: 'var(--text-muted)',
                }}
              >
                {formatTokens(u.ai.outputTokens)}
              </div>
            </div>

            {/* Calls */}
            <div
              style={{
                textAlign: 'right',
                fontFamily: 'var(--font-mono)',
                fontSize: 13,
                color: 'var(--text-muted)',
              }}
            >
              {formatNumber(u.ai.calls)}
            </div>

            {/* Storage USD */}
            <div style={{ textAlign: 'right' }}>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 13.5,
                  color: 'var(--text-strong)',
                }}
              >
                {formatUSD(u.storage.usd)}
              </div>
              <div
                style={{
                  fontSize: 11.5,
                  color: 'var(--text-subtle)',
                }}
              >
                {formatBytes(u.storage.avgBytes)}
              </div>
            </div>

            {/* Total USD */}
            <div
              style={{
                textAlign: 'right',
                fontFamily: 'var(--font-mono)',
                fontSize: 14,
                fontWeight: 700,
                color: 'var(--text-strong)',
              }}
            >
              {formatUSD(u.usd)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
