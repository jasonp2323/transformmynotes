import type { ButtonHTMLAttributes, ReactNode } from 'react';

type IconButtonVariant = 'plain' | 'solid' | 'soft' | 'accent';
type IconButtonSize = 'sm' | 'md' | 'lg';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  label: string;
  className?: string;
  children?: ReactNode;
}

export default function IconButton({
  variant = 'plain',
  size = 'md',
  label,
  className = '',
  children,
  ...rest
}: IconButtonProps) {
  const cls = [
    'tmn-iconbtn',
    `tmn-iconbtn--${variant}`,
    `tmn-iconbtn--${size}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={cls}
      aria-label={label}
      title={label}
      {...rest}
    >
      {children}
    </button>
  );
}
