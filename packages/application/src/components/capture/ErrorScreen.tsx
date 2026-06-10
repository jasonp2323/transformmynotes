import React from 'react';
import { Icon, Button, HandNote } from '@/src/components/ui';

// ---------------------------------------------------------------------------
// ErrorScreen — full-screen overlay shown when transcription fails
// ---------------------------------------------------------------------------

interface ErrorScreenProps {
  onRetake: () => void;
  onUpload: () => void;
}

const TIPS = [
  'Find even, natural light',
  'Lay the page flat',
  'Fit the whole page in frame',
];

export function ErrorScreen({ onRetake, onUpload }: ErrorScreenProps) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10,
        background: 'var(--surface-card)',
        display: 'flex',
        flexDirection: 'column',
        padding: '14px 28px 26px',
      }}
    >
      {/* Top region — centered content */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
        }}
      >
        {/* Blurred note + danger badge */}
        <div style={{ position: 'relative', marginBottom: 26 }}>
          {/* Blurred HandNote */}
          <div
            style={{
              filter: 'blur(2.5px) saturate(0.7)',
              opacity: 0.7,
              transform: 'rotate(-3deg)',
            }}
          >
            <HandNote tilt={0} style={{ width: 170, padding: '16px 14px' }} />
          </div>

          {/* Centered danger circle overlay */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                background: 'var(--danger-50)',
                border: '2px solid var(--danger-500)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="image-off" size={24} color="var(--danger-500)" />
            </div>
          </div>
        </div>

        {/* Heading */}
        <h2
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 23,
            fontWeight: 600,
            color: 'var(--text-strong)',
            margin: '0 0 8px',
          }}
        >
          That page came out blurry
        </h2>

        {/* Body paragraph */}
        <p
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 15.5,
            color: 'var(--text-muted)',
            margin: '0 0 18px',
            lineHeight: 1.6,
            maxWidth: 280,
          }}
        >
          We couldn&rsquo;t read the handwriting confidently. Try again with
          more light and the page flat.
        </p>

        {/* Tips list */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            width: '100%',
            maxWidth: 280,
          }}
        >
          {TIPS.map((tip, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontFamily: 'var(--font-sans)',
                fontSize: 13.5,
                color: 'var(--text-muted)',
                textAlign: 'left',
              }}
            >
              <Icon name="check" size={15} color="var(--success)" />
              {tip}
            </div>
          ))}
        </div>
      </div>

      {/* Bottom CTAs */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Button
          variant="primary"
          size="lg"
          fullWidth
          leftIcon={<Icon name="rotate-ccw" size={18} />}
          onClick={onRetake}
        >
          Retake
        </Button>
        <Button variant="ghost" size="md" fullWidth onClick={onUpload}>
          Upload a clearer photo
        </Button>
      </div>
    </div>
  );
}
