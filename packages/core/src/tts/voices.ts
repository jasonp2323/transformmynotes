import type { PollyEngine } from '../study/config.js';

export type PtBrVoiceId = 'Camila' | 'Vitoria' | 'Thiago' | 'Ricardo';

export interface PtBrVoice {
  id: PtBrVoiceId;
  label: string;
  gender: 'F' | 'M';
  engines: readonly PollyEngine[];
  defaultEngine: PollyEngine;
}

export const PT_BR_VOICES: readonly PtBrVoice[] = [
  { id: 'Camila', label: 'Camila', gender: 'F', engines: ['neural', 'standard', 'generative'], defaultEngine: 'neural' },
  { id: 'Vitoria', label: 'Vitória', gender: 'F', engines: ['neural', 'standard'], defaultEngine: 'neural' },
  { id: 'Thiago', label: 'Thiago', gender: 'M', engines: ['neural'], defaultEngine: 'neural' },
  { id: 'Ricardo', label: 'Ricardo', gender: 'M', engines: ['standard'], defaultEngine: 'standard' },
] as const;

export function isPtBrVoiceId(v: string): v is PtBrVoiceId {
  return PT_BR_VOICES.some((voice) => voice.id === v);
}

export function resolveVoiceEngine(voiceId: string, preferred?: string): PollyEngine {
  const voice = PT_BR_VOICES.find((v) => v.id === voiceId);
  if (!voice) {
    throw new Error(`resolveVoiceEngine: unknown pt-BR voice "${voiceId}"`);
  }
  if (preferred !== undefined && voice.engines.includes(preferred as PollyEngine)) {
    return preferred as PollyEngine;
  }
  return voice.defaultEngine;
}
