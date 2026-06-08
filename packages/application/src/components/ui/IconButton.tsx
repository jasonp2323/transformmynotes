import React from 'react';
import { cn } from '@/src/lib/cn';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'plain' | 'soft' | 'solid';
  size?: 'sm' | 'md';
  label: string;
}

const variantClass: Record<NonNullable<IconButtonProps['variant']>, string> = {
  plain: 'tmn-iconbtn--plain',
  soft: 'tmn-iconbtn--soft',
  solid: 'tmn-iconbtn--solid',
};

const sizeClass: Record<NonNullable<IconButtonProps['size']>, string> = {
  sm: 'tmn-iconbtn--sm',
  md: 'tmn-iconbtn--md',
};

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    {
      variant = 'plain',
      size = 'md',
      label,
      children,
      className,
      type,
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type ?? 'button'}
        aria-label={label}
        title={label}
        className={cn('tmn-iconbtn', variantClass[variant], sizeClass[size], className)}
        {...rest}
      >
        {children}
      </button>
    );
  },
);

IconButton.displayName = 'IconButton';
