import React from 'react';
import { cn } from '@/src/lib/cn';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input(
    {
      label,
      hint,
      error,
      required,
      leadingIcon,
      trailingIcon,
      id: idProp,
      className,
      ...rest
    },
    ref,
  ) {
    const generatedId = React.useId();
    const id = idProp ?? generatedId;
    const hintId = `${id}-hint`;
    const hasHint = !!(hint || error);

    return (
      <div className="tmn-field">
        {label && (
          <label className="tmn-field__label" htmlFor={id}>
            {label}
            {required && <span className="tmn-field__req">*</span>}
          </label>
        )}
        <div className="tmn-input-wrap">
          {leadingIcon && (
            <span className="tmn-input-wrap__lead" aria-hidden="true">
              {leadingIcon}
            </span>
          )}
          <input
            ref={ref}
            id={id}
            required={required}
            aria-invalid={error ? true : undefined}
            aria-describedby={hasHint ? hintId : undefined}
            className={cn(
              'tmn-input',
              leadingIcon && 'tmn-input--with-lead',
              trailingIcon && 'tmn-input--with-trail',
              className,
            )}
            {...rest}
          />
          {trailingIcon && (
            <span className="tmn-input-wrap__trail" aria-hidden="true">
              {trailingIcon}
            </span>
          )}
        </div>
        {hasHint && (
          <span
            id={hintId}
            className={cn('tmn-field__hint', error && 'tmn-field__hint--error')}
          >
            {error ?? hint}
          </span>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';
