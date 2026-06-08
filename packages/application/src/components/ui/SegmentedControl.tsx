'use client';

import React, { useState } from 'react';
import { cn } from '@/src/lib/cn';

export interface SegmentedOption {
  value: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
}

export interface SegmentedControlProps {
  options: (SegmentedOption | string)[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  className?: string;
}

function normalise(opt: SegmentedOption | string): SegmentedOption {
  if (typeof opt === 'string') {
    return { value: opt, label: opt };
  }
  return opt;
}

export function SegmentedControl({
  options,
  value,
  defaultValue,
  onChange,
  className,
}: SegmentedControlProps) {
  const normalised = options.map(normalise);
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState<string>(
    defaultValue ?? (normalised[0]?.value ?? ''),
  );

  const activeValue = isControlled ? value : internalValue;
  const activeIndex = Math.max(
    normalised.findIndex((o) => o.value === activeValue),
    0,
  );
  const n = normalised.length;

  function handleClick(optValue: string) {
    if (!isControlled) {
      setInternalValue(optValue);
    }
    onChange?.(optValue);
  }

  return (
    <div role="group" className={cn('tmn-seg', className)}>
      <span
        className="tmn-seg__pill"
        aria-hidden="true"
        suppressHydrationWarning
        style={{
          width: `calc((100% - 8px) / ${n})`,
          transform: `translateX(${activeIndex * 100}%)`,
        }}
      />
      {normalised.map((opt) => {
        const isActive = opt.value === activeValue;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => handleClick(opt.value)}
            className={cn('tmn-seg__btn', isActive && 'tmn-seg__btn--active')}
          >
            {opt.icon && <span>{opt.icon}</span>}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
