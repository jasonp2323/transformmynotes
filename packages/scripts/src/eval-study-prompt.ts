/**
 * eval-study-prompt.ts
 *
 * Manual evaluation script for the M13 study-generation prompts.
 *
 * USAGE (requires a live SST stage with all study secrets seeded):
 *   cd packages/scripts && sst shell --stage <stage> tsx src/eval-study-prompt.ts
 *   # or from repo root:
 *   npm run eval-study-prompt --prefix packages/scripts
 *
 * This script is NOT a CI gate. Run it manually before each prompt iteration
 * to score output quality against the rubric in:
 *   packages/core/test/fixtures/study-prompt/rubric.md
 *
 * Outputs are written to tmp/eval-output/ (git-ignored).
 */

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateStudyMaterial } from '../../core/src/study/generate.js';
import type { StudyMaterialType, StudyLanguage } from '../../core/src/study/types.js';

// ── Fixture definitions ───────────────────────────────────────────────────────

interface Fixture {
  file: string;
  title: string;
  type: StudyMaterialType;
  language?: StudyLanguage;
  description: string;
}

const FIXTURES: Fixture[] = [
  {
    file: 'grammar-subjuntivo.md',
    title: 'Subjuntivo Presente — Usos Principais',
    type: 'flashcards',
    description: 'Grammar rules note in pt-BR — should produce pt-BR flashcards',
  },
  {
    file: 'vocabulary-comida.md',
    title: 'Vocabulário — Comida Brasileira',
    type: 'flashcards',
    description: 'Vocabulary list note in pt-BR — should produce pt-BR flashcards',
  },
  {
    file: 'history-proclamacao.md',
    title: 'Proclamação da República Brasileira (1889)',
    type: 'quiz',
    description: 'History note in pt-BR — should produce a pt-BR multiple-choice quiz',
  },
  {
    file: 'bilingual-false-friends.md',
    title: 'False Friends — Inglês ↔ Português Brasileiro',
    type: 'flashcards',
    language: 'bilingual',
    description: 'Language-learning note — should produce bilingual pt-BR ↔ en flashcards',
  },
  {
    file: 'biology-celula.md',
    title: 'A Célula — Estrutura e Função',
    type: 'summary',
    description: 'Biology note in pt-BR — should produce a pt-BR summary with glossary',
  },
  {
    file: 'math-funcoes.md',
    title: 'Funções — Conceitos Fundamentais',
    type: 'assignment',
    description: 'Math note in pt-BR — should produce a pt-BR written assignment with rubric',
  },
];

// ── Paths ─────────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// packages/scripts/src → packages/scripts → packages → repo root
const REPO_ROOT = resolve(__dirname, '../../../..');
const FIXTURES_DIR = join(REPO_ROOT, 'packages/core/test/fixtures/study-prompt');
const OUTPUT_DIR = join(REPO_ROOT, 'tmp/eval-output');

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log('='.repeat(70));
  console.log('Study-Prompt Eval Script — M13.1.3');
  console.log('Rubric: packages/core/test/fixtures/study-prompt/rubric.md');
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log('='.repeat(70));
  console.log();

  const results: Array<{ fixture: Fixture; success: boolean; error?: string }> = [];

  for (const fixture of FIXTURES) {
    const fixturePath = join(FIXTURES_DIR, fixture.file);
    console.log(`── ${fixture.file} (${fixture.type}${fixture.language ? ', ' + fixture.language : ''}) ──`);
    console.log(`   ${fixture.description}`);

    let noteMarkdown: string;
    try {
      noteMarkdown = readFileSync(fixturePath, 'utf8');
    } catch {
      console.error(`   ERROR: Could not read fixture file: ${fixturePath}`);
      results.push({ fixture, success: false, error: `File not found: ${fixturePath}` });
      continue;
    }

    try {
      console.log(`   Calling generateStudyMaterial...`);
      const result = await generateStudyMaterial({
        type: fixture.type,
        noteMarkdown,
        noteTitle: fixture.title,
        language: fixture.language,
      });

      const outputFile = join(
        OUTPUT_DIR,
        fixture.file.replace('.md', `.${fixture.type}.json`),
      );
      const output = {
        fixture: fixture.file,
        type: fixture.type,
        language: fixture.language ?? 'pt-BR',
        promptVersion: result.promptVersion,
        usage: result.usage,
        payload: result.payload,
      };
      writeFileSync(outputFile, JSON.stringify(output, null, 2), 'utf8');
      console.log(`   Output written to: ${outputFile}`);
      console.log(`   promptVersion: ${result.promptVersion}`);
      console.log(
        `   tokens used: ${result.usage?.inputTokens} in / ${result.usage?.outputTokens} out`,
      );
      results.push({ fixture, success: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`   ERROR: ${msg}`);
      results.push({ fixture, success: false, error: msg });
    }
    console.log();
  }

  // ── Summary ────────────────────────────────────────────────────────────────

  console.log('='.repeat(70));
  console.log('RESULTS SUMMARY');
  console.log('='.repeat(70));

  const passed = results.filter((r) => r.success).length;
  const total = results.length;
  console.log(`${passed}/${total} fixtures generated successfully\n`);

  for (const r of results) {
    const status = r.success ? 'PASS' : 'FAIL';
    const label = `${r.fixture.file} (${r.fixture.type})`;
    if (r.success) {
      console.log(`  [${status}] ${label}`);
    } else {
      console.log(`  [${status}] ${label} — ${r.error}`);
    }
  }

  console.log();
  console.log('='.repeat(70));
  console.log('MANUAL SCORING CHECKLIST');
  console.log('='.repeat(70));
  console.log('Open tmp/eval-output/ and score each output against rubric.md.');
  console.log('Acceptance bar: for each fixture, >= 4 out of 5 criteria score >= 3/5.');
  console.log();

  for (const r of results.filter((r) => r.success)) {
    const outputFile = `tmp/eval-output/${r.fixture.file.replace('.md', `.${r.fixture.type}.json`)}`;
    console.log(`[ ] ${r.fixture.file} -> ${outputFile}`);
    console.log(`    Type: ${r.fixture.type} | Language: ${r.fixture.language ?? 'pt-BR'}`);
    console.log(`    Check: ${r.fixture.description}`);
    console.log();
  }

  if (passed < total) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
