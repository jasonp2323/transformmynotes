import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

// NOTE: the module has module-level state (`loaded`), so we must always pass
// an explicit baseDir in tests (which bypasses the cache).

const ENV_KEYS = [
  'SST_RESOURCE_STUDY_SYSTEM_PROMPT_value',
  'SST_RESOURCE_STUDY_FLASHCARDS_PROMPT_value',
  'SST_RESOURCE_STUDY_QUIZ_PROMPT_value',
  'SST_RESOURCE_STUDY_ASSIGNMENT_PROMPT_value',
  'SST_RESOURCE_STUDY_SUMMARY_PROMPT_value',
  'SST_RESOURCE_STUDY_GLOSSARY_PROMPT_value',
  'SST_RESOURCE_STUDY_GUIDE_PROMPT_value',
];

const FILE_NAMES = [
  'STUDY_SYSTEM_PROMPT.txt',
  'STUDY_FLASHCARDS_PROMPT.txt',
  'STUDY_QUIZ_PROMPT.txt',
  'STUDY_ASSIGNMENT_PROMPT.txt',
  'STUDY_SUMMARY_PROMPT.txt',
  'STUDY_GLOSSARY_PROMPT.txt',
  'STUDY_GUIDE_PROMPT.txt',
];

describe('loadStudyPromptsIntoEnv', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'study-prompts-test-'));
    // Clean env keys before each test
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    // Clean up env keys
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }
    // Clean up temp dir
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('sets all 7 env vars from the prompt files', async () => {
    // Write all 7 files with known contents
    for (let i = 0; i < FILE_NAMES.length; i++) {
      fs.writeFileSync(path.join(tmpDir, FILE_NAMES[i]), `content-${i}`, 'utf8');
    }

    const { loadStudyPromptsIntoEnv } = await import('./study-prompts.js');
    loadStudyPromptsIntoEnv(tmpDir);

    for (let i = 0; i < ENV_KEYS.length; i++) {
      expect(process.env[ENV_KEYS[i]]).toBe(`content-${i}`);
    }
  });

  it('strips a leading UTF-8 BOM', async () => {
    for (const fileName of FILE_NAMES) {
      fs.writeFileSync(path.join(tmpDir, fileName), '﻿my-content', 'utf8');
    }

    const { loadStudyPromptsIntoEnv } = await import('./study-prompts.js');
    loadStudyPromptsIntoEnv(tmpDir);

    for (const key of ENV_KEYS) {
      expect(process.env[key]).toBe('my-content');
    }
  });

  it('does not overwrite an already-set env var', async () => {
    process.env['SST_RESOURCE_STUDY_SYSTEM_PROMPT_value'] = 'pre-existing';
    for (const fileName of FILE_NAMES) {
      fs.writeFileSync(path.join(tmpDir, fileName), 'file-content', 'utf8');
    }

    const { loadStudyPromptsIntoEnv } = await import('./study-prompts.js');
    loadStudyPromptsIntoEnv(tmpDir);

    expect(process.env['SST_RESOURCE_STUDY_SYSTEM_PROMPT_value']).toBe('pre-existing');
  });

  it('throws naming the missing file when a prompt file is absent', async () => {
    // tmpDir is empty — no files written
    const { loadStudyPromptsIntoEnv } = await import('./study-prompts.js');
    expect(() => loadStudyPromptsIntoEnv(tmpDir)).toThrow('STUDY_SYSTEM_PROMPT.txt');
  });
});
