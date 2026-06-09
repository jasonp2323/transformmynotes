import React from 'react';

export interface BrandmarkProps {
  size?: number;
  label?: boolean;
  color?: string;
}

export function Brandmark({ size = 40, label = true, color = 'var(--text-strong)' }: BrandmarkProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
      <img
        src="/assets/logo-mark.svg"
        width={size}
        height={size}
        alt=""
        style={{ filter: 'drop-shadow(0 6px 14px rgba(0,0,0,0.25))' }}
      />
      {label && (
        <span
          style={{
            fontFamily: 'var(--font-serif)',
            fontWeight: 600,
            fontSize: size * 0.52,
            color,
            letterSpacing: '-0.01em',
          }}
        >
          TransformMyNotes
        </span>
      )}
    </div>
  );
}
