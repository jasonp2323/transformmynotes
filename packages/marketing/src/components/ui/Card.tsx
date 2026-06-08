import type { CSSProperties, ReactNode } from 'react';

type CardVariant = 'default' | 'interactive' | 'flat' | 'ghost';

interface CardProps {
  variant?: CardVariant;
  padded?: boolean;
  accentBar?: boolean;
  as?: keyof JSX.IntrinsicElements;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

export default function Card({
  variant = 'default',
  padded = true,
  accentBar = false,
  as: Tag = 'div',
  className = '',
  style,
  children,
  ...rest
}: CardProps) {
  const cls = [
    'tmn-card',
    padded ? 'tmn-card--pad' : '',
    variant === 'interactive' ? 'tmn-card--interactive' : '',
    variant === 'flat' ? 'tmn-card--flat' : '',
    variant === 'ghost' ? 'tmn-card--ghost' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const accentStyle: CSSProperties = padded
    ? { margin: '-20px -20px 16px' }
    : {};

  return (
    <Tag className={cls} style={style} {...rest}>
      {accentBar ? <div className="tmn-card__accent" style={accentStyle} /> : null}
      {children}
    </Tag>
  );
}
