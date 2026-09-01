/**
 * Drift-guard: asserts that the bundled DEFAULT_* prompt constants in
 * `packages/core/src/study/default-prompts.ts` stay in sync with the
 * repo-root `prompts/*.txt` source files.
 *
 * When this test fails it means a `.txt` file was edited without updating
 * the constant (or vice-versa) — fix by copying the changed content into
 * `default-prompts.ts` (the single source of truth for the deployed Lambda).
 *
 * `npm run test:unit` runs from the repo root, so `process.cwd()` resolves
 * correctly to the repo root and `path.join(process.cwd(), 'prompts', …)`
 * finds the files.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {
  DEFAULT_SYSTEM_PROMPT,
  DEFAULT_TYPE_PROMPTS,
} from '../../src/study/default-prompts';

function readPromptFile(filename: string): string {
  const filePath = path.join(process.cwd(), 'prompts', filename);
  const raw = fs.readFileSync(filePath, 'utf8');
  // Strip a leading UTF-8 BOM (U+FEFF) if present — some editors add one.
  return raw.startsWith('﻿') ? raw.slice(1) : raw;
}

describe('default-prompts drift guard', () => {
  it('DEFAULT_SYSTEM_PROMPT matches STUDY_SYSTEM_PROMPT.txt verbatim', () => {
    const file = readPromptFile('STUDY_SYSTEM_PROMPT.txt');
    expect(DEFAULT_SYSTEM_PROMPT).toBe(file);
  });

  it('DEFAULT_TYPE_PROMPTS.flashcards matches STUDY_FLASHCARDS_PROMPT.txt verbatim', () => {
    const file = readPromptFile('STUDY_FLASHCARDS_PROMPT.txt');
    expect(DEFAULT_TYPE_PROMPTS.flashcards).toBe(file);
  });

  it('DEFAULT_TYPE_PROMPTS.quiz matches STUDY_QUIZ_PROMPT.txt verbatim', () => {
    const file = readPromptFile('STUDY_QUIZ_PROMPT.txt');
    expect(DEFAULT_TYPE_PROMPTS.quiz).toBe(file);
  });

  it('DEFAULT_TYPE_PROMPTS.assignment matches STUDY_ASSIGNMENT_PROMPT.txt verbatim', () => {
    const file = readPromptFile('STUDY_ASSIGNMENT_PROMPT.txt');
    expect(DEFAULT_TYPE_PROMPTS.assignment).toBe(file);
  });

  it('DEFAULT_TYPE_PROMPTS.summary matches STUDY_SUMMARY_PROMPT.txt verbatim', () => {
    const file = readPromptFile('STUDY_SUMMARY_PROMPT.txt');
    expect(DEFAULT_TYPE_PROMPTS.summary).toBe(file);
  });

  it('DEFAULT_TYPE_PROMPTS.glossary matches STUDY_GLOSSARY_PROMPT.txt verbatim', () => {
    const file = readPromptFile('STUDY_GLOSSARY_PROMPT.txt');
    expect(DEFAULT_TYPE_PROMPTS.glossary).toBe(file);
  });

  it('DEFAULT_TYPE_PROMPTS.study_guide matches STUDY_GUIDE_PROMPT.txt verbatim', () => {
    const file = readPromptFile('STUDY_GUIDE_PROMPT.txt');
    expect(DEFAULT_TYPE_PROMPTS.study_guide).toBe(file);
  });

  it('DEFAULT_TYPE_PROMPTS.study_guide contains an English-scaffolding language rule', () => {
    // Verifies that the study-guide prompt instructs the model to write
    // instructional scaffolding in English while keeping subject content
    // in its source language — the fix for the Portuguese study-guide bug.
    expect(DEFAULT_TYPE_PROMPTS.study_guide).toContain('LANGUAGE RULE');
    expect(DEFAULT_TYPE_PROMPTS.study_guide).toContain('ENGLISH');
    expect(DEFAULT_TYPE_PROMPTS.study_guide).toContain('source language');
  });
});
