'use client';
import React from 'react';
import { Icon } from '@/src/components/ui';

export interface PasswordFieldProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  placeholder?: string;
  id?: string;
  required?: boolean;
}

export function PasswordField({
  label = 'Password',
  value,
  onChange,
  hint,
  placeholder = 'Your password',
  id: idProp,
  required,
}: PasswordFieldProps) {
  const [show, setShow] = React.useState(false);
  const generatedId = React.useId();
  const id = idProp ?? generatedId;
  const hintId = `${id}-hint`;

  return (
    <div className="tmn-field">
      <label className="tmn-field__label" htmlFor={id}>
        {label}
        {required && <span className="tmn-field__req">*</span>}
      </label>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <input
          id={id}
          type={show ? 'text' : 'password'}
          className="tmn-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          aria-describedby={hint ? hintId : undefined}
          style={{ paddingRight: 44 }}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? 'Hide password' : 'Show password'}
          style={{
            position: 'absolute',
            right: 8,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: 'var(--text-subtle)',
            width: 32,
            height: 32,
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
          }}
        >
          <Icon name={show ? 'eye-off' : 'eye'} size={18} />
        </button>
      </div>
      {hint && (
        <span id={hintId} className="tmn-field__hint">
          {hint}
        </span>
      )}
    </div>
  );
}
