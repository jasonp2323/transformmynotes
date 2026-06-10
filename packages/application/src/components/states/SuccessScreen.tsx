'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/src/components/ui/Button';
import { Icon } from '@/src/components/ui/Icon';

export interface SuccessScreenProps {
  noteId: string;
  title: string;
  highlights: number;
  words: number;
  langPair: string;
  ocrConfidence: number;
}

export function SuccessScreen({
  noteId,
  title,
  highlights,
  words,
  ocrConfidence,
}: SuccessScreenProps) {
  const router = useRouter();

  const highlightLabel = highlights === 1 ? 'highlight' : 'highlights';

  return (
    <div className="tmn-success-screen">
      <div className="tmn-success-content">
        {/* Success ring */}
        <div className="tmn-success-ring" style={{ position: 'relative', width: 104, height: 104, marginBottom: 26 }}>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              background: 'var(--success-50)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 16,
              borderRadius: '50%',
              background: 'var(--success-500)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 10px 26px rgba(74,138,98,0.4)',
            }}
          >
            <Icon name="check" size={40} stroke={3} style={{ color: '#fff' }} />
          </div>
        </div>

        {/* Heading */}
        <h1 className="tmn-success-heading">Saved to your notebook</h1>

        {/* Subtitle */}
        <p className="tmn-success-subtitle">
          &ldquo;{title}&rdquo; is clean and searchable.{' '}
          <strong style={{ color: 'var(--text-body)' }}>
            {highlights} {highlightLabel}
          </strong>{' '}
          were added to your review deck.
        </p>

        {/* Stats row */}
        <div className="tmn-success-stats">
          <span>★ {highlights} {highlightLabel}</span>
          <span>{words.toLocaleString()} words</span>
          <span>OCR {ocrConfidence}%</span>
        </div>

        {/* CTA buttons */}
        <div className="tmn-success-cta">
          <Button
            variant="primary"
            size="lg"
            fullWidth
            leftIcon={<Icon name="book-open" size={18} />}
            onClick={() => router.push(`/notes/${noteId}`)}
          >
            View note
          </Button>
          <Button
            variant="ghost"
            size="md"
            fullWidth
            onClick={() => router.push('/dashboard')}
          >
            Back to library
          </Button>
        </div>
      </div>
    </div>
  );
}
