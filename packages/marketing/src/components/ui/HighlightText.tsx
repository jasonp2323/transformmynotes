import type { ReactNode } from 'react';

type HighlightVariant = 'gold' | 'strong' | 'teal' | 'underline';

interface HighlightTextProps {
  variant?: HighlightVariant;
  animate?: boolean;
  className?: string;
  children?: ReactNode;
}

export default function HighlightText({
  variant = 'gold',
  animate = false,
  className = '',
  children,
}: HighlightTextProps) {
  const cls = [
    'tmn-mark',
    variant === 'strong' ? 'tmn-mark--strong' : '',
    variant === 'teal' ? 'tmn-mark--teal' : '',
    variant === 'underline' ? 'tmn-mark--underline' : '',
    animate ? 'tmn-mark--swipe' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return <mark className={cls}>{children}</mark>;
}
