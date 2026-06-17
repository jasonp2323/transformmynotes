import { describe, it, expect } from 'vitest';
import {
  buildPhaseSystemPrompt,
  MAP_PHASE_INSTRUCTION,
  REDUCE_PHASE_INSTRUCTION,
  AUTO_DIRECTIVE,
  PT_BR_DIRECTIVE,
  BILINGUAL_DIRECTIVE,
  MAP_TOOL_SCHEMA,
  MAP_MAX_ITEMS_BY_TYPE,
} from '../generate.js';

const BASE = 'You are a study material generation assistant.';
const TYPE_PROMPT = 'Focus on concise flashcards with clear cues.';

describe('buildPhaseSystemPrompt', () => {
  it('single-pass (no phase): base + typePrompt + languageDirective', () => {
    const result = buildPhaseSystemPrompt(BASE, TYPE_PROMPT, AUTO_DIRECTIVE);
    expect(result).toBe(`${BASE}\n\n${TYPE_PROMPT}\n\n${AUTO_DIRECTIVE}`);
  });

  it('single-pass: omits typePrompt block when typePrompt is empty', () => {
    const result = buildPhaseSystemPrompt(BASE, '', AUTO_DIRECTIVE);
    expect(result).toBe(`${BASE}\n\n${AUTO_DIRECTIVE}`);
  });

  it('single-pass: uses PT_BR_DIRECTIVE correctly', () => {
    const result = buildPhaseSystemPrompt(BASE, '', PT_BR_DIRECTIVE);
    expect(result).toBe(`${BASE}\n\n${PT_BR_DIRECTIVE}`);
  });

  it('single-pass: uses BILINGUAL_DIRECTIVE correctly', () => {
    const result = buildPhaseSystemPrompt(BASE, '', BILINGUAL_DIRECTIVE);
    expect(result).toBe(`${BASE}\n\n${BILINGUAL_DIRECTIVE}`);
  });

  it('map phase: appends MAP_PHASE_INSTRUCTION after combined prompt', () => {
    const result = buildPhaseSystemPrompt(BASE, TYPE_PROMPT, AUTO_DIRECTIVE, 'map');
    expect(result).toBe(
      `${BASE}\n\n${TYPE_PROMPT}\n\n${AUTO_DIRECTIVE}\n\n${MAP_PHASE_INSTRUCTION}`,
    );
  });

  it('map phase: empty typePrompt still appends MAP_PHASE_INSTRUCTION', () => {
    const result = buildPhaseSystemPrompt(BASE, '', AUTO_DIRECTIVE, 'map');
    expect(result).toBe(`${BASE}\n\n${AUTO_DIRECTIVE}\n\n${MAP_PHASE_INSTRUCTION}`);
  });

  it('reduce phase: appends REDUCE_PHASE_INSTRUCTION after combined prompt', () => {
    const result = buildPhaseSystemPrompt(BASE, TYPE_PROMPT, AUTO_DIRECTIVE, 'reduce');
    expect(result).toBe(
      `${BASE}\n\n${TYPE_PROMPT}\n\n${AUTO_DIRECTIVE}\n\n${REDUCE_PHASE_INSTRUCTION}`,
    );
  });

  it('reduce phase: empty typePrompt still appends REDUCE_PHASE_INSTRUCTION', () => {
    const result = buildPhaseSystemPrompt(BASE, '', AUTO_DIRECTIVE, 'reduce');
    expect(result).toBe(`${BASE}\n\n${AUTO_DIRECTIVE}\n\n${REDUCE_PHASE_INSTRUCTION}`);
  });

  it('map and reduce produce different suffixes', () => {
    const mapResult = buildPhaseSystemPrompt(BASE, '', AUTO_DIRECTIVE, 'map');
    const reduceResult = buildPhaseSystemPrompt(BASE, '', AUTO_DIRECTIVE, 'reduce');
    expect(mapResult).not.toBe(reduceResult);
  });

  it('single-pass produces a different prompt from map (no phase suffix)', () => {
    const singlePass = buildPhaseSystemPrompt(BASE, '', AUTO_DIRECTIVE);
    const mapPhase = buildPhaseSystemPrompt(BASE, '', AUTO_DIRECTIVE, 'map');
    expect(mapPhase.length).toBeGreaterThan(singlePass.length);
    expect(mapPhase).toContain(MAP_PHASE_INSTRUCTION);
    expect(singlePass).not.toContain(MAP_PHASE_INSTRUCTION);
  });
});

describe('MAP_TOOL_SCHEMA', () => {
  it('is an object schema with a required candidates array', () => {
    const schema = MAP_TOOL_SCHEMA as Record<string, unknown>;
    expect(schema.type).toBe('object');
    const required = schema.required as string[];
    expect(required).toContain('candidates');
    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.candidates.type).toBe('array');
  });

  it('candidate items require the text field', () => {
    const schema = MAP_TOOL_SCHEMA as Record<string, unknown>;
    const props = schema.properties as Record<string, Record<string, unknown>>;
    const items = props.candidates.items as Record<string, unknown>;
    const required = items.required as string[];
    expect(required).toContain('text');
  });
});

describe('MAP_MAX_ITEMS_BY_TYPE', () => {
  it('quiz is capped at 10', () => {
    expect(MAP_MAX_ITEMS_BY_TYPE.quiz).toBe(10);
  });

  it('flashcards is capped at 15', () => {
    expect(MAP_MAX_ITEMS_BY_TYPE.flashcards).toBe(15);
  });

  it('all non-quiz types are capped at 15', () => {
    const types = ['flashcards', 'assignment', 'summary', 'glossary', 'study_guide'] as const;
    for (const t of types) {
      expect(MAP_MAX_ITEMS_BY_TYPE[t]).toBe(15);
    }
  });
});
