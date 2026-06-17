import { createHash } from 'node:crypto';

/**
 * Canonical cache key for a TTS synthesis request.
 * hash = sha256(text + "|" + voiceId + "|" + engine + "|" + (ssmlRate ?? ""))
 * Returns lowercase hex.
 *
 * The separator `|` prevents collisions between concatenated values.
 */
export function audioHash(
  text: string,
  voiceId: string,
  engine: string,
  ssmlRate?: string,
): string {
  const parts = [text, voiceId, engine, ssmlRate ?? ''].join('|');
  return createHash('sha256').update(parts).digest('hex');
}
