'use client';

import React, { useEffect, useState } from 'react';
import { cn } from '@/src/lib/cn';
import {
  DEFAULT_VOICE_ID,
  getStoredVoiceId,
  setStoredVoiceId,
  TTS_VOICES,
  type TtsVoiceId,
} from '@/src/lib/tts';

export interface VoiceSelectorProps {
  className?: string;
}

export function VoiceSelector({ className }: VoiceSelectorProps) {
  // Initialise to the default so SSR and the first client render agree, then
  // sync from localStorage in an effect to avoid a hydration mismatch.
  const [selected, setSelected] = useState<TtsVoiceId>(DEFAULT_VOICE_ID);

  useEffect(() => {
    setSelected(getStoredVoiceId() ?? DEFAULT_VOICE_ID);
  }, []);

  function handleSelect(id: TtsVoiceId) {
    setSelected(id);
    setStoredVoiceId(id);
  }

  return (
    <div
      role="radiogroup"
      aria-label="Pronunciation voice"
      className={cn('inline-flex items-center gap-1 rounded-full bg-surface-card p-1', className)}
    >
      {TTS_VOICES.map((voice) => {
        const isActive = voice.id === selected;
        return (
          <button
            key={voice.id}
            type="button"
            role="radio"
            aria-checked={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => handleSelect(voice.id)}
            className={cn(
              'rounded-full px-3 py-1 text-sm font-medium transition-colors',
              isActive
                ? 'bg-brand text-white'
                : 'text-text-muted hover:text-text',
            )}
          >
            {voice.label}
          </button>
        );
      })}
    </div>
  );
}
