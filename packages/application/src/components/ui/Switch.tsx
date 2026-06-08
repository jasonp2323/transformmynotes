'use client';

import React from 'react';
import { cn } from '@/src/lib/cn';

export interface SwitchProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: React.ReactNode;
}

export const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  function Switch({ label, id: idProp, className, ...rest }, ref) {
    const generatedId = React.useId();
    const id = idProp ?? generatedId;

    return (
      <label className={cn('tmn-switch', className)} htmlFor={id}>
        <input type="checkbox" role="switch" id={id} ref={ref} {...rest} />
        <span className="tmn-switch__track" aria-hidden="true">
          <span className="tmn-switch__thumb" />
        </span>
        {label && <span className="tmn-switch__label">{label}</span>}
      </label>
    );
  },
);

Switch.displayName = 'Switch';
