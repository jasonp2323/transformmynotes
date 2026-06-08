import React from 'react';
import { cn } from '@/src/lib/cn';

export interface HandNoteProps extends React.HTMLAttributes<HTMLDivElement> {
  lines?: string[];
  tilt?: number;
  children?: React.ReactNode;
}

const HAND_LINES = [
  'El subjuntivo — duda, deseo,',
  'posibilidad.  3 patrones:',
  '-ar   -er   -ir',
  'que yo hable / coma / viva',
  'ojalá que llueva  ☂',
  '* repasar para el examen *',
];

export const HandNote = function HandNote({
  lines,
  tilt = 0,
  children: _children,
  className,
  style,
  ...rest
}: HandNoteProps) {
  const displayLines = lines ?? HAND_LINES;
  return (
    <div
      className={cn('tmn-hand', className)}
      style={{ transform: `rotate(${tilt}deg)`, ...style }}
      {...rest}
    >
      {displayLines.map((l, i) => (
        <div
          key={i}
          className="tmn-hand__line"
          style={{ transform: `rotate(${i % 2 ? -0.5 : 0.6}deg)` }}
        >
          {l}
        </div>
      ))}
    </div>
  );
};

HandNote.displayName = 'HandNote';
