import React from 'react';
import { cn } from '@/src/lib/cn';

export interface CardProps extends React.HTMLAttributes<HTMLElement> {
  variant?: 'default' | 'interactive' | 'flat' | 'ghost';
  padded?: boolean;
  accentBar?: boolean;
  as?: 'div' | 'article' | 'section' | 'button';
  children?: React.ReactNode;
}

export const Card = function Card({
  variant = 'default',
  padded = true,
  accentBar = false,
  as = 'div',
  children,
  className,
  ...rest
}: CardProps) {
  const Component = as as React.ElementType;
  return (
    <Component
      className={cn(
        'tmn-card',
        padded && 'tmn-card--pad',
        variant === 'interactive' && 'tmn-card--interactive',
        variant === 'flat' && 'tmn-card--flat',
        variant === 'ghost' && 'tmn-card--ghost',
        className,
      )}
      {...rest}
    >
      {accentBar && <div className="tmn-card__accent" />}
      {children}
    </Component>
  );
};

Card.displayName = 'Card';
