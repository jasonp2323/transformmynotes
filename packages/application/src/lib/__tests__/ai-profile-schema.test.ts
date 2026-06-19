import { describe, it, expect } from 'vitest';
import { aiProfileUpdateSchema, CUSTOM_INSTRUCTIONS_MAX } from '../ai-profile-schema';

describe('aiProfileUpdateSchema', () => {
  it('accepts a valid full input', () => {
    const result = aiProfileUpdateSchema.safeParse({
      focus: 'Grammar',
      level: 'Intermediate',
      goals: 'Pass exam',
      preferredLanguage: 'pt-BR',
      customInstructions: 'Keep it simple.',
    });
    expect(result.success).toBe(true);
  });

  it('rejects customInstructions exceeding the max length', () => {
    const result = aiProfileUpdateSchema.safeParse({
      customInstructions: 'a'.repeat(CUSTOM_INSTRUCTIONS_MAX + 1),
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid preferredLanguage value', () => {
    const result = aiProfileUpdateSchema.safeParse({
      preferredLanguage: 'es-ES',
    });
    expect(result.success).toBe(false);
  });

  it('accepts an empty object (all fields optional)', () => {
    const result = aiProfileUpdateSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('trims whitespace from focus', () => {
    const result = aiProfileUpdateSchema.safeParse({ focus: '  hi  ' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.focus).toBe('hi');
    }
  });
});
