'use client';

import React from 'react';
import { cn } from '@/src/lib/cn';

export interface CollapsibleProps {
  title: React.ReactNode;
  children?: React.ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
}

export function Collapsible({
  title,
  children,
  defaultOpen,
  open,
  onOpenChange,
  disabled,
  className,
  headerClassName,
  contentClassName,
}: CollapsibleProps) {
  const reactId = React.useId();
  const triggerId = `${reactId}-trigger`;
  const regionId = `${reactId}-region`;

  const isControlled = open !== undefined;
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen ?? false);
  const isOpen = isControlled ? open : internalOpen;

  function handleToggle() {
    if (disabled) return;
    const next = !isOpen;
    if (!isControlled) {
      setInternalOpen(next);
    }
    onOpenChange?.(next);
  }

  return (
    <div className={cn('tmn-collapsible', className)}>
      <div className={cn('tmn-collapsible__header', headerClassName)}>
        <button
          type="button"
          id={triggerId}
          className="tmn-collapsible__trigger"
          aria-expanded={isOpen}
          aria-controls={regionId}
          disabled={disabled}
          onClick={handleToggle}
        >
          <span className="tmn-collapsible__title">{title}</span>
          <svg
            className={cn('tmn-collapsible__chevron', isOpen && 'tmn-collapsible__chevron--open')}
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M6 4l4 4-4 4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
      <div
        id={regionId}
        role="region"
        aria-labelledby={triggerId}
        hidden={!isOpen}
        className={cn('tmn-collapsible__content', contentClassName)}
      >
        {children}
      </div>
    </div>
  );
}

Collapsible.displayName = 'Collapsible';
