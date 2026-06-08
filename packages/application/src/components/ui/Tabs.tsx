'use client';

import React, { useState } from 'react';
import { cn } from '@/src/lib/cn';

export interface TabItem {
  value: string;
  label: React.ReactNode;
  count?: number;
}

export interface TabsProps {
  items: TabItem[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  className?: string;
}

export function Tabs({ items, value, defaultValue, onChange, className }: TabsProps) {
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState<string>(
    defaultValue ?? (items[0]?.value ?? ''),
  );

  const activeValue = isControlled ? value : internalValue;

  function handleClick(itemValue: string) {
    if (!isControlled) {
      setInternalValue(itemValue);
    }
    onChange?.(itemValue);
  }

  return (
    <div role="tablist" className={cn('tmn-tabs', className)}>
      {items.map((item) => {
        const isActive = item.value === activeValue;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => handleClick(item.value)}
            className={cn('tmn-tab', isActive && 'tmn-tab--active')}
          >
            {item.label}
            {item.count != null && (
              <span className="tmn-tab__count">{item.count}</span>
            )}
            {isActive && <span className="tmn-tab__underline" />}
          </button>
        );
      })}
    </div>
  );
}
