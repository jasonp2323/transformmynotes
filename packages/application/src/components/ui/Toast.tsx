'use client';

import React, { useEffect } from 'react';
import { cn } from '@/src/lib/cn';

export interface ToastProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  tone?: 'brand' | 'success' | 'warning' | 'danger' | 'neutral';
  icon?: React.ReactNode;
  title?: React.ReactNode;
  children?: React.ReactNode;
  onClose?: () => void;
  duration?: number;
}

export function Toast({
  tone,
  icon,
  title,
  children,
  onClose,
  duration = 4000,
  className,
  ...rest
}: ToastProps) {
  useEffect(() => {
    if (!onClose || duration <= 0) return;
    const id = setTimeout(onClose, duration);
    return () => clearTimeout(id);
  }, [onClose, duration]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('tmn-toast', tone && `tmn-toast--${tone}`, className)}
      {...rest}
    >
      {icon && <span className="tmn-toast__icon">{icon}</span>}
      <div className="tmn-toast__body">
        {title && <div className="tmn-toast__title">{title}</div>}
        {children && <div className="tmn-toast__desc">{children}</div>}
      </div>
      {onClose && (
        <button
          type="button"
          className="tmn-toast__close"
          aria-label="Dismiss"
          onClick={onClose}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <line x1="3" y1="3" x2="13" y2="13" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="13" y1="3" x2="3" y2="13" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
}
