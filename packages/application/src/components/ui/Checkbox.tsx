'use client';

import React, { useEffect, useRef } from 'react';
import { cn } from '@/src/lib/cn';

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: React.ReactNode;
  indeterminate?: boolean;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  function Checkbox(
    { label, indeterminate, id: idProp, className, ...rest },
    forwardedRef,
  ) {
    const generatedId = React.useId();
    const id = idProp ?? generatedId;

    const internalRef = useRef<HTMLInputElement | null>(null);

    // Merge the internal ref with the forwarded ref.
    // ForwardedRef<T> = RefCallback<T> | MutableRefObject<T | null> | null.
    // After ruling out function and null, the remaining type is MutableRefObject
    // (writable .current). The double-cast through `unknown` satisfies the type checker.
    const mergedRef = (node: HTMLInputElement | null) => {
      internalRef.current = node;
      if (typeof forwardedRef === 'function') {
        forwardedRef(node);
      } else if (forwardedRef != null) {
        (forwardedRef as unknown as React.MutableRefObject<HTMLInputElement | null>).current =
          node;
      }
    };

    useEffect(() => {
      if (internalRef.current) {
        internalRef.current.indeterminate = !!indeterminate;
      }
    }, [indeterminate]);

    return (
      <label className={cn('tmn-check', className)} htmlFor={id}>
        <input type="checkbox" id={id} ref={mergedRef} {...rest} />
        <span className="tmn-check__box" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={3.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </span>
        {label && <span className="tmn-check__label">{label}</span>}
      </label>
    );
  },
);

Checkbox.displayName = 'Checkbox';
