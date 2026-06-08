import type { MouseEventHandler, ReactNode } from 'react';

type TagTone = 'default' | 'brand';

interface TagProps {
  tone?: TagTone;
  hash?: boolean;
  onRemove?: MouseEventHandler<HTMLButtonElement>;
  className?: string;
  children?: ReactNode;
  onClick?: MouseEventHandler<HTMLSpanElement>;
}

export default function Tag({
  tone = 'default',
  hash = false,
  onRemove,
  className = '',
  children,
  onClick,
}: TagProps) {
  const interactive = Boolean(onClick);
  const cls = [
    'tmn-tag',
    tone === 'brand' ? 'tmn-tag--brand' : '',
    interactive ? 'tmn-tag--interactive' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={cls} onClick={onClick}>
      {hash ? <span className="tmn-tag__hash">#</span> : null}
      {children}
      {onRemove ? (
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
      ) : null}
    </span>
  );
}
