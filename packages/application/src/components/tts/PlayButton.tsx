'use client';

import React, { useRef, useState } from 'react';
import { Icon } from '@/src/components/ui/Icon';
import { Toast } from '@/src/components/ui/Toast';
import { cn } from '@/src/lib/cn';
import { audioErrorMessage, getStoredVoiceId } from '@/src/lib/tts';

export interface PlayButtonProps {
  text: string;
  label?: string; // visible text label next to icon (optional)
  ssmlRate?: 'slow' | 'medium' | 'fast'; // optional; forwarded to the API
  size?: number; // icon size, default 20
  className?: string;
  ariaLabel?: string; // default 'Play pronunciation'
}

export function PlayButton({
  text,
  label,
  ssmlRate,
  size = 20,
  className,
  ariaLabel,
}: PlayButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  async function handleClick() {
    if (!text || !text.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const voiceId = getStoredVoiceId();
      const body: { text: string; voiceId?: string; ssmlRate?: string } = { text };
      if (voiceId) body.voiceId = voiceId;
      if (ssmlRate) body.ssmlRate = ssmlRate;

      const res = await fetch('/api/audio/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data: { url?: string } = await res.json();
        if (data?.url && audioRef.current) {
          audioRef.current.src = data.url;
          // Triggered inside the click handler so it counts as a user
          // gesture (required for iOS Safari). Swallow autoplay rejection.
          try {
            await audioRef.current.play();
          } catch {
            // autoplay rejection should not throw uncaught
          }
        }
      } else {
        let serverError: string | undefined;
        try {
          const errBody: { error?: string } = await res.json();
          serverError = errBody?.error;
        } catch {
          // ignore body parse failure
        }
        setError(audioErrorMessage(res.status, serverError));
      }
    } catch {
      setError('Audio unavailable.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        aria-busy={loading}
        aria-label={ariaLabel ?? 'Play pronunciation'}
        className={cn('inline-flex items-center gap-1.5', className)}
      >
        <span
          className="inline-flex items-center justify-center"
          style={{ width: size, height: size }}
        >
          {loading ? (
            <Icon name="loader-circle" size={size} className="animate-spin" />
          ) : (
            <Icon name="volume-2" size={size} />
          )}
        </span>
        {label && <span>{label}</span>}
      </button>

      {/* No autoPlay — playback is started explicitly from the click handler. */}
      <audio ref={audioRef} hidden preload="none" />

      {error && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
          <Toast
            tone="danger"
            title="Audio"
            onClose={() => setError(null)}
            duration={3500}
          >
            {error}
          </Toast>
        </div>
      )}
    </>
  );
}
