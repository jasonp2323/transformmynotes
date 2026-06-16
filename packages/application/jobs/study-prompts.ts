import fs from 'fs';
import path from 'path';

const PROMPT_FILES: Array<{ file: string; envKey: string }> = [
  { file: 'STUDY_SYSTEM_PROMPT.txt',     envKey: 'SST_RESOURCE_STUDY_SYSTEM_PROMPT_value' },
  { file: 'STUDY_FLASHCARDS_PROMPT.txt', envKey: 'SST_RESOURCE_STUDY_FLASHCARDS_PROMPT_value' },
  { file: 'STUDY_QUIZ_PROMPT.txt',       envKey: 'SST_RESOURCE_STUDY_QUIZ_PROMPT_value' },
  { file: 'STUDY_ASSIGNMENT_PROMPT.txt', envKey: 'SST_RESOURCE_STUDY_ASSIGNMENT_PROMPT_value' },
  { file: 'STUDY_SUMMARY_PROMPT.txt',    envKey: 'SST_RESOURCE_STUDY_SUMMARY_PROMPT_value' },
  { file: 'STUDY_GLOSSARY_PROMPT.txt',   envKey: 'SST_RESOURCE_STUDY_GLOSSARY_PROMPT_value' },
  { file: 'STUDY_GUIDE_PROMPT.txt',      envKey: 'SST_RESOURCE_STUDY_GUIDE_PROMPT_value' },
];

let loaded = false;

/**
 * Reads each study prompt .txt file from `baseDir` (or
 * `$LAMBDA_TASK_ROOT/prompts` / `<cwd>/prompts` by default) and assigns
 * the content to the corresponding `process.env.SST_RESOURCE_STUDY_*_PROMPT_value`
 * key so that `resolveAiConfig()` can read it without the key being a Lambda
 * configured environment variable (which is subject to the 4 KB limit).
 *
 * - Only assigns if the key is not already set (tests/overrides win).
 * - Strips a leading UTF-8 BOM (U+FEFF) defensively.
 * - Module-level cache: no-arg calls skip disk after the first load.
 *   Calls with an explicit `baseDir` always re-read (useful in tests).
 * - Throws loudly if any file is missing or unreadable.
 */
export function loadStudyPromptsIntoEnv(baseDir?: string): void {
  // If no explicit dir is provided, use the module-level cache.
  if (baseDir === undefined) {
    if (loaded) return;
  }

  const dir =
    baseDir ??
    path.join(process.env.LAMBDA_TASK_ROOT ?? process.cwd(), 'prompts');

  for (const { file, envKey } of PROMPT_FILES) {
    // Only assign if not already set (explicit override / test wins).
    if (process.env[envKey] !== undefined) continue;

    const filePath = path.join(dir, file);
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
      throw new Error(
        `study-prompts: failed to read prompt file "${filePath}": ${(err as Error).message}`,
      );
    }
    // Strip leading UTF-8 BOM if present.
    if (content.charCodeAt(0) === 0xfeff) {
      content = content.slice(1);
    }
    process.env[envKey] = content;
  }

  if (baseDir === undefined) {
    loaded = true;
  }
}
