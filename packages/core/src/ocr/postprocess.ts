/**
 * Post-processing for raw Bedrock OCR output.
 *
 * Pure function — no AWS, no I/O.
 */

export interface ProcessedMarkdown {
  markdown: string;
  wordCount: number;
  detectedLang: 'pt-BR → en' | 'unknown';
  /** Integer 0–100. */
  ocrConfidence: number;
}

// Lead-in phrases that signal preamble/postamble lines (case-insensitive prefix match).
const PREAMBLE_PREFIXES = [
  "here is",
  "here's",
  "below is",
  "sure",
  "certainly",
  "i have",
  "i've",
  "the following",
  "this is the",
];

/**
 * Returns true if a trimmed line is a preamble/postamble conversational lead-in.
 */
function isPreambleLine(line: string): boolean {
  const lower = line.trim().toLowerCase();
  return PREAMBLE_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

/**
 * Strip leading preamble lines (and following blank lines).
 * Strip trailing postamble lines (and preceding blank lines).
 */
function stripPreamble(lines: string[]): string[] {
  // Strip from the start
  let start = 0;
  while (start < lines.length && (lines[start].trim() === '' || isPreambleLine(lines[start]))) {
    // Only skip blank lines if they immediately follow a preamble, not standalone blanks at the very top
    // Better approach: strip leading preamble lines, then leading blank lines, iteratively
    if (isPreambleLine(lines[start])) {
      start++;
      // Also skip blank lines immediately following
      while (start < lines.length && lines[start].trim() === '') {
        start++;
      }
    } else {
      // Leading blank lines before any preamble — skip them too
      start++;
    }
  }

  // Strip from the end
  let end = lines.length - 1;
  while (end >= start && (lines[end].trim() === '' || isPreambleLine(lines[end]))) {
    if (isPreambleLine(lines[end])) {
      end--;
      // Also skip blank lines immediately before
      while (end >= start && lines[end].trim() === '') {
        end--;
      }
    } else {
      // Trailing blank lines after the last real line
      end--;
    }
  }

  return lines.slice(start, end + 1);
}

/**
 * Strip a wrapping markdown code fence (```...```) if the entire output is wrapped.
 * Handles an optional language tag (e.g. ```markdown).
 */
function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenceOpen = /^```[a-zA-Z]*\n/;
  const fenceClose = /\n```$/;
  if (fenceOpen.test(trimmed) && fenceClose.test(trimmed)) {
    return trimmed.replace(fenceOpen, '').replace(fenceClose, '');
  }
  return text;
}

/**
 * Count tokens that represent real words (at least one alphanumeric char after
 * stripping leading/trailing markdown punctuation).
 *
 * Pure markdown syntax tokens that don't count:
 *   ##, ###, **, ==, |, -, and standalone ordered-list markers like 1. / 2.
 * Tokens like ==term== or **bold** that contain real letters DO count once.
 */
function countWords(text: string): number {
  const tokens = text.split(/\s+/).filter((t) => t.length > 0);
  let count = 0;
  for (const token of tokens) {
    // Skip standalone ordered-list markers like "1.", "2.", "10." before any stripping.
    if (/^\d+\.$/.test(token)) {
      continue;
    }

    // Strip leading markdown punctuation: #, *, =, |, >, -
    // Strip trailing markdown punctuation: #, *, =, |, >, -
    let stripped = token.replace(/^[#*=|>\-]+/, '').replace(/[#*=|>\-]+$/, '');

    // Count as a word only if at least one alphanumeric character remains
    if (/[a-zA-Z0-9]/.test(stripped)) {
      count++;
    }
  }
  return count;
}

/**
 * Detects Brazilian-Portuguese diacritics in the first 200 words of text.
 */
function detectLang(text: string): 'pt-BR → en' | 'unknown' {
  const words = text.split(/\s+/).filter((t) => t.length > 0).slice(0, 200);
  const sample = words.join(' ');
  // Brazilian-Portuguese diacritics: ã, õ, ç, ê, ô, á, é, í, ó, ú, â, à
  if (/[ãõçêôáéíóúâà]/i.test(sample)) {
    return 'pt-BR → en';
  }
  return 'unknown';
}

/**
 * Post-processes raw Bedrock OCR output into a structured result.
 *
 * Steps (in order):
 *  1. NFC-normalise (preserves accented characters).
 *  2. Strip wrapping code fence.
 *  3. Strip leading/trailing preamble/postamble lines.
 *  4. Compute wordCount (excluding pure markdown syntax tokens).
 *  5. Detect language from first 200 words.
 *  6. Compute ocrConfidence from [?] marker frequency.
 */
export function postprocessMarkdown(raw: string): ProcessedMarkdown {
  // 1. NFC normalisation
  let text = raw.normalize('NFC');

  // 2. Strip wrapping code fence
  text = stripCodeFence(text);

  // 3. Strip preamble/postamble lines
  const lines = text.split('\n');
  const cleanedLines = stripPreamble(lines);
  const markdown = cleanedLines.join('\n');

  // 4. Word count
  const wordCount = countWords(markdown);

  // 5. Detect language
  const detectedLang = detectLang(markdown);

  // 6. OCR confidence
  const unknownCount = (markdown.match(/\[\?\]/g) ?? []).length;
  let ocrConfidence: number;
  if (wordCount === 0) {
    ocrConfidence = 100;
  } else {
    ocrConfidence = Math.round((1 - unknownCount / wordCount) * 100);
    // Clamp to 0..100
    ocrConfidence = Math.max(0, Math.min(100, ocrConfidence));
  }

  return { markdown, wordCount, detectedLang, ocrConfidence };
}
