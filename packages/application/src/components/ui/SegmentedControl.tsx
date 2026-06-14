'use client';

import React, { useState, useRef, useCallback, useLayoutEffect, useEffect } from 'react';
import { cn } from '@/src/lib/cn';

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

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
  ariaLabel?: string;
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
  ariaLabel,
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

  const containerRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);

  const measure = useCallback(() => {
    const btn = btnRefs.current[activeIndex];
    if (btn) setPill({ left: btn.offsetLeft, width: btn.offsetWidth });
  }, [activeIndex]);

  useIsoLayoutEffect(() => { measure(); }, [measure, n, options]);

  // Re-measure whenever the control or its segments change size. A plain
  // window-resize listener misses two cases that silently break alignment:
  // container reflows that don't resize the window, and async web-font swaps
  // (the custom UI font can load *after* the first layout-effect measurement,
  // widening the labels). A ResizeObserver on the container + buttons catches
  // both; `document.fonts.ready` is a belt-and-suspenders trigger for the swap.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    btnRefs.current.forEach((b) => { if (b) ro.observe(b); });
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      document.fonts.ready.then(() => measure()).catch(() => {});
    }
    return () => ro.disconnect();
  }, [measure, n]);

  function handleSelect(optValue: string) {
    if (!isControlled) {
      setInternalValue(optValue);
    }
    onChange?.(optValue);
  }

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, idx: number) => {
      let nextIdx: number | null = null;

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        nextIdx = (idx + 1) % n;
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        nextIdx = (idx - 1 + n) % n;
      } else if (e.key === 'Home') {
        e.preventDefault();
        nextIdx = 0;
      } else if (e.key === 'End') {
        e.preventDefault();
        nextIdx = n - 1;
      }

      if (nextIdx !== null) {
        const opt = normalised[nextIdx];
        if (opt) {
          handleSelect(opt.value);
          btnRefs.current[nextIdx]?.focus();
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [n, normalised],
  );

  return (
    <div
      ref={containerRef}
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn('tmn-seg', className)}
    >
      <span
        className="tmn-seg__pill"
        aria-hidden="true"
        suppressHydrationWarning
        style={
          pill
            ? { left: pill.left, width: pill.width }
            : {
                left: 4,
                width: `calc((100% - 8px - ${(n - 1) * 2}px) / ${n})`,
              }
        }
      />
      {normalised.map((opt, idx) => {
        const isActive = opt.value === activeValue;
        return (
          <button
            key={opt.value}
            ref={(el) => { btnRefs.current[idx] = el; }}
            type="button"
            role="radio"
            aria-checked={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => handleSelect(opt.value)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
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
