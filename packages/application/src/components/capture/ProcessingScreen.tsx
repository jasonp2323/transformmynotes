'use client';
import React, { useEffect, useState } from 'react';
import { Icon } from '@/src/components/ui';

// ---------------------------------------------------------------------------
// ProcessingScreen — full-screen overlay shown while upload/transcription runs
// ---------------------------------------------------------------------------

interface ProcessingScreenProps {
  prefersReducedMotion: boolean;
}

const STEPS: [string, string][] = [
  ['scan-line', 'Page detected'],
  ['type', 'Text recognised'],
  ['highlighter', 'Finding highlights'],
];

// Progress bar fill widths for each step value (0..3)
const BAR_WIDTHS = ['12%', '42%', '72%', '92%'];

export function ProcessingScreen({ prefersReducedMotion }: ProcessingScreenProps) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setStep(1), 600);
    const t2 = setTimeout(() => setStep(2), 1500);
    const t3 = setTimeout(() => setStep(3), 2600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  const ocrPct = Math.min(98, 30 + step * 22);
  const barWidth = BAR_WIDTHS[step] ?? '92%';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10,
        background: 'var(--surface-card)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 22,
        padding: '0 30px',
      }}
    >
      {/* Brand icon square */}
      <div
        style={{
          width: 92,
          height: 92,
          borderRadius: 26,
          background: 'var(--gradient-transform)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: 'var(--shadow-brand)',
        }}
      >
        <Icon name="sparkles" size={42} color="#fff" />
      </div>

      {/* Heading */}
      <div
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 24,
          fontWeight: 600,
          color: 'var(--text-strong)',
        }}
      >
        Transforming…
      </div>

      {/* Progress bar */}
      <div
        style={{
          width: 220,
          height: 7,
          borderRadius: 99,
          background: 'var(--surface-sunken)',
          boxShadow: 'var(--shadow-inset)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: barWidth,
            borderRadius: 99,
            background: 'var(--gradient-transform)',
            transition: prefersReducedMotion ? 'none' : 'width 0.4s ease',
          }}
        />
      </div>

      {/* OCR mono label */}
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 12.5,
          color: 'var(--text-muted)',
        }}
      >
        reading handwriting · OCR {ocrPct}%
      </div>

      {/* Step checklist */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          marginTop: 6,
          width: '100%',
          maxWidth: 240,
        }}
      >
        {STEPS.map(([icon, label], i) => {
          const done = step > i;
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontFamily: 'var(--font-sans)',
                fontSize: 14,
                color: done ? 'var(--text-body)' : 'var(--text-subtle)',
              }}
            >
              <Icon
                name={done ? 'check-circle-2' : icon}
                size={18}
                color={done ? 'var(--success)' : 'var(--text-subtle)'}
              />
              {label}
            </div>
          );
        })}
      </div>
    </div>
  );
}
