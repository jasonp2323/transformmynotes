import type { ReactNode } from 'react';

type BadgeTone = 'neutral' | 'brand' | 'accent' | 'success' | 'warning' | 'danger' | 'solid';

interface BadgeProps {
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
  children?: ReactNode;
}

export default function Badge({
  tone = 'neutral',
  dot = false,
  className = '',
  children,
}: BadgeProps) {
  const cls = [
    'tmn-badge',
    `tmn-badge--${tone}`,
    dot ? 'tmn-badge--dot' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return <span className={cls}>{children}</span>;
}
