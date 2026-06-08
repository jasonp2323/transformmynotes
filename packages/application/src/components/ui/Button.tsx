import React from 'react';
import { cn } from '@/src/lib/cn';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft' | 'accent';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  loading?: boolean;
}

const variantClass: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'tmn-btn--primary',
  secondary: 'tmn-btn--secondary',
  ghost: 'tmn-btn--ghost',
  danger: 'tmn-btn--danger',
  soft: 'tmn-btn--soft',
  accent: 'tmn-btn--accent',
};

const sizeClass: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'tmn-btn--sm',
  md: 'tmn-btn--md',
  lg: 'tmn-btn--lg',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = 'primary',
      size = 'md',
      fullWidth = false,
      leftIcon,
      rightIcon,
      loading = false,
      children,
      className,
      disabled,
      type,
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type ?? 'button'}
        disabled={disabled || loading}
        aria-busy={loading ? true : undefined}
        className={cn(
          'tmn-btn',
          variantClass[variant],
          sizeClass[size],
          fullWidth && 'tmn-btn--full',
          loading && 'tmn-btn--loading',
          className,
        )}
        {...rest}
      >
        {loading && <span className="tmn-btn__spinner" aria-hidden="true" />}
        {leftIcon && <span className="tmn-btn__icon">{leftIcon}</span>}
        {children}
        {rightIcon && <span className="tmn-btn__icon">{rightIcon}</span>}
      </button>
    );
  },
);

Button.displayName = 'Button';
