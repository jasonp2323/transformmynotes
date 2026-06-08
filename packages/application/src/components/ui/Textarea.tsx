import React from 'react';
import { cn } from '@/src/lib/cn';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
  ruled?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea(
    {
      label,
      hint,
      error,
      ruled = false,
      required,
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
        <textarea
          ref={ref}
          id={id}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={hasHint ? hintId : undefined}
          className={cn('tmn-textarea', ruled && 'tmn-textarea--paper', className)}
          {...rest}
        />
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

Textarea.displayName = 'Textarea';
