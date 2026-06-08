'use client';

import { useState, type ReactNode } from 'react';

interface SegmentOption {
  value: string;
  label: string;
  icon?: ReactNode;
}

interface SegmentedControlProps {
  options?: (SegmentOption | string)[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  className?: string;
}

export default function SegmentedControl({
  options = [],
  value,
  defaultValue,
  onChange,
  className = '',
}: SegmentedControlProps) {
  const norm: SegmentOption[] = options.map((o) =>
    typeof o === 'string' ? { value: o, label: o } : o
  );

  const isControlled = value !== undefined;
  const [internal, setInternal] = useState<string>(
    defaultValue ?? (norm[0] ? norm[0].value : '')
  );

  const active = isControlled ? value : internal;

  function select(v: string) {
    if (!isControlled) setInternal(v);
    onChange?.(v);
  }

  return (
    <div className={`tmn-seg ${className}`} role="group">
      {norm.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === active}
          className={`tmn-seg__btn${o.value === active ? ' tmn-seg__btn--active' : ''}`}
          onClick={() => select(o.value)}
        >
          {o.icon ? (
            <span style={{ display: 'inline-flex' }}>{o.icon}</span>
          ) : null}
          {o.label}
        </button>
      ))}
    </div>
  );
}
