import React from 'react';
import { cn } from '@/src/lib/cn';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: 'neutral' | 'brand' | 'accent' | 'success' | 'warning' | 'danger' | 'solid';
  dot?: boolean;
  children?: React.ReactNode;
}

export const Badge = function Badge({
  tone = 'neutral',
  dot = false,
  children,
  className,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={cn(
        'tmn-badge',
        `tmn-badge--${tone}`,
        dot && 'tmn-badge--dot',
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
};

Badge.displayName = 'Badge';
