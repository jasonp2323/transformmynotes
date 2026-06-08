import React from 'react';
import { cn } from '@/src/lib/cn';

export interface HighlightTextProps extends React.HTMLAttributes<HTMLElement> {
  variant?: 'gold' | 'teal' | 'strong' | 'underline';
  animate?: boolean;
  children?: React.ReactNode;
}

export const HighlightText = function HighlightText({
  variant = 'gold',
  animate = false,
  children,
  className,
  ...rest
}: HighlightTextProps) {
  return (
    <mark
      className={cn(
        'tmn-mark',
        variant === 'strong' && 'tmn-mark--strong',
        variant === 'teal' && 'tmn-mark--teal',
        variant === 'underline' && 'tmn-mark--underline',
        animate && 'tmn-mark--swipe',
        className,
      )}
      {...rest}
    >
      {children}
    </mark>
  );
};

HighlightText.displayName = 'HighlightText';
