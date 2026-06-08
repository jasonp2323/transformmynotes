import React from 'react';
import { cn } from '@/src/lib/cn';

export interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  name?: string;
  src?: string;
  size?: 'sm' | 'md' | 'lg';
  ring?: boolean;
}

const TINTS = [
  'linear-gradient(135deg,#16747e,#4a8a62)',
  'linear-gradient(135deg,#4a8a62,#97ab38)',
  'linear-gradient(135deg,#307f70,#7ea046)',
  'linear-gradient(135deg,#97ab38,#cbc11c)',
];

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] ?? '')
    .join('')
    .toUpperCase();
}

export const Avatar = function Avatar({
  name = '',
  src,
  size = 'md',
  ring = false,
  className,
  style,
  ...rest
}: AvatarProps) {
  return (
    <span
      className={cn(
        'tmn-avatar',
        `tmn-avatar--${size}`,
        ring && 'tmn-avatar__ring',
        className,
      )}
      style={{
        background: src ? undefined : TINTS[(name.charCodeAt(0) || 0) % TINTS.length],
        ...style,
      }}
      {...rest}
    >
      {src ? (
        // Avatars accept arbitrary external / data-URL srcs where next/image optimisation does not apply.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} />
      ) : (
        initials(name)
      )}
    </span>
  );
};

Avatar.displayName = 'Avatar';
