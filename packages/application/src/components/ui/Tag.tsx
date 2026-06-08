import React from 'react';
import { cn } from '@/src/lib/cn';

export interface TagProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: 'default' | 'brand';
  hash?: boolean;
  onRemove?: (e: React.MouseEvent) => void;
  children?: React.ReactNode;
}

export const Tag = function Tag({
  tone = 'default',
  hash = false,
  onRemove,
  children,
  className,
  onClick,
  ...rest
}: TagProps) {
  const interactive = Boolean(onClick);
  return (
    <span
      className={cn(
        'tmn-tag',
        tone === 'brand' && 'tmn-tag--brand',
        interactive && 'tmn-tag--interactive',
        className,
      )}
      onClick={onClick}
      {...rest}
    >
      {hash && <span className="tmn-tag__hash">#</span>}
      {children}
      {onRemove && (
        <button
          type="button"
          className="tmn-tag__x"
          aria-label="Remove"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(e);
          }}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          >
            <line x1="5" y1="5" x2="19" y2="19" />
            <line x1="19" y1="5" x2="5" y2="19" />
          </svg>
        </button>
      )}
    </span>
  );
};

Tag.displayName = 'Tag';
