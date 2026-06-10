import React from 'react';
import { Card } from '@/src/components/ui/Card';
import { Icon } from '@/src/components/ui/Icon';

export interface EmptyPanelProps {
  icon: string;
  title: string;
  sub: string;
}

/**
 * Centred empty-state panel used by admin list pages when they have no rows.
 * Ported from the design's EmptyPanel function in screens-admin.jsx.
 */
export function EmptyPanel({ icon, title, sub }: EmptyPanelProps) {
  return (
    <Card padded style={{ padding: '56px 24px', textAlign: 'center' }}>
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 18,
          background: 'var(--surface-brand-soft)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 16,
        }}
      >
        <Icon name={icon} size={28} style={{ color: 'var(--brand-strong)' }} />
      </div>
      <div
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 20,
          fontWeight: 600,
          color: 'var(--text-strong)',
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: 14.5, color: 'var(--text-muted)' }}>{sub}</div>
    </Card>
  );
}

EmptyPanel.displayName = 'EmptyPanel';
