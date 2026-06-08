import React from 'react';
import { cn } from '@/src/lib/cn';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  options?: (SelectOption | string)[];
  placeholder?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  function Select(
    {
      label,
      hint,
      options,
      placeholder,
      children,
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

    return (
      <div className="tmn-select-wrap">
        {label && (
          <label className="tmn-field__label" htmlFor={id}>
            {label}
            {required && <span className="tmn-field__req">*</span>}
          </label>
        )}
        <div className="tmn-select-inner">
          <select
            ref={ref}
            id={id}
            required={required}
            aria-describedby={hint ? hintId : undefined}
            className={cn('tmn-select', className)}
            {...rest}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {children
              ? children
              : options?.map((opt) => {
                  const o: SelectOption =
                    typeof opt === 'string' ? { value: opt, label: opt } : opt;
                  return (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  );
                })}
          </select>
          <span className="tmn-select-chevron" aria-hidden="true" />
        </div>
        {hint && (
          <span id={hintId} className="tmn-field__hint">
            {hint}
          </span>
        )}
      </div>
    );
  },
);

Select.displayName = 'Select';
