'use client';

import React, { useEffect, useState } from 'react';
import { cn } from '@/src/lib/cn';
import { Button, Toast } from '@/src/components/ui';
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
  // `pending` is the in-progress radio selection; `saved` is the persisted
  // baseline. The Save button is enabled only when they differ.
  const [pending, setPending] = useState<TtsVoiceId>(DEFAULT_VOICE_ID);
  const [saved, setSaved] = useState<TtsVoiceId>(DEFAULT_VOICE_ID);
  const [showToast, setShowToast] = useState(false);

  useEffect(() => {
    const stored = getStoredVoiceId() ?? DEFAULT_VOICE_ID;
    setPending(stored);
    setSaved(stored);
  }, []);

  const dirty = pending !== saved;

  function handleSave() {
    setStoredVoiceId(pending);
    setSaved(pending);
    setShowToast(true);
  }

  return (
    <div className={cn('inline-flex flex-col items-start gap-3', className)}>
      <div
        role="radiogroup"
        aria-label="Pronunciation voice"
        className="inline-flex items-center gap-1 rounded-full bg-surface-card p-1"
      >
        {TTS_VOICES.map((voice) => {
          const isActive = voice.id === pending;
          return (
            <button
              key={voice.id}
              type="button"
              role="radio"
              aria-checked={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setPending(voice.id)}
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

      <Button variant="primary" size="sm" disabled={!dirty} onClick={handleSave}>
        Save
      </Button>

      {showToast && (
        <Toast
          tone="success"
          title="Voice saved"
          onClose={() => setShowToast(false)}
          duration={2500}
        />
      )}
    </div>
  );
}
