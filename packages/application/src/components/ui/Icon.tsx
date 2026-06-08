import React from 'react';
import { iconRegistry } from './icons';

export interface IconProps {
  name: string;
  size?: number;
  stroke?: number;
  className?: string;
  style?: React.CSSProperties;
  color?: string;
}

export function Icon({ name, size = 22, stroke = 2, className, style, color }: IconProps): React.ReactElement | null {
  const LucideIcon = iconRegistry[name];
  if (!LucideIcon) return null;

  return (
    <LucideIcon
      size={size}
      strokeWidth={stroke}
      className={className}
      style={{ display: 'inline-flex', flex: 'none', ...style }}
      color={color}
    />
  );
}
