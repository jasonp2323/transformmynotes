import { describe, it, expect } from 'vitest';
import { postprocessMarkdown } from '../../src/ocr/postprocess';

describe('postprocessMarkdown', () => {
  // ── Preamble / postamble stripping ────────────────────────────────────────

  it('strips a leading "Here is the transcription:" preamble line', () => {
    const raw = 'Here is the transcription:\n\n## My Notes\nSome content here.';
    const { markdown } = postprocessMarkdown(raw);
    expect(markdown).not.toMatch(/Here is/i);
    expect(markdown).toContain('## My Notes');
    expect(markdown).toContain('Some content here.');
  });

  it('strips a leading "Here\'s the markdown you requested" preamble line', () => {
    const raw = "Here's the markdown you requested\n\n## Section\nContent.";
    const { markdown } = postprocessMarkdown(raw);
    expect(markdown).not.toMatch(/here's/i);
    expect(markdown).toContain('## Section');
  });

  it('strips a leading "Below is the transcription" preamble line', () => {
    const raw = 'Below is the transcription\n\n## Header\nDetails.';
    const { markdown } = postprocessMarkdown(raw);
    expect(markdown).not.toMatch(/below is/i);
    expect(markdown).toContain('## Header');
  });

  it('strips a trailing postamble line starting with "Here is"', () => {
    const raw = '## Notes\nContent here.\n\nHere is some additional info if needed.';
    const { markdown } = postprocessMarkdown(raw);
    expect(markdown).toContain('## Notes');
    expect(markdown).toContain('Content here.');
    // The trailing "Here is" line should be stripped
    expect(markdown.trim()).not.toMatch(/Here is some additional info/);
  });

  it('strips a trailing "I have transcribed the content" postamble', () => {
    const raw = '## Study Notes\nKey concepts.\n\nI have transcribed all visible text.';
    const { markdown } = postprocessMarkdown(raw);
    expect(markdown).toContain('## Study Notes');
    expect(markdown.trim()).not.toMatch(/I have transcribed/);
  });

  it('does NOT strip content lines in the middle that match preamble patterns', () => {
    // A "Here is" that appears mid-document should be preserved
    const raw = '## Introduction\nHere is an important concept.\n## Conclusion\nEnd.';
    const { markdown } = postprocessMarkdown(raw);
    expect(markdown).toContain('Here is an important concept.');
  });

  // ── Code fence stripping ───────────────────────────────────────────────────

  it('strips a wrapping ```markdown ... ``` fence', () => {
    const raw = '```markdown\n## My Notes\nSome content.\n```';
    const { markdown } = postprocessMarkdown(raw);
    expect(markdown).not.toContain('```');
    expect(markdown).toContain('## My Notes');
    expect(markdown).toContain('Some content.');
  });

  it('strips a wrapping plain ``` ... ``` fence (no language tag)', () => {
    const raw = '```\n## Header\nBody text.\n```';
    const { markdown } = postprocessMarkdown(raw);
    expect(markdown).not.toContain('```');
    expect(markdown).toContain('## Header');
    expect(markdown).toContain('Body text.');
  });

  it('does NOT strip a code fence that only wraps part of the content', () => {
    const raw = '## Notes\n```\ncode snippet\n```\nMore text.';
    const { markdown } = postprocessMarkdown(raw);
    // The internal fence is NOT stripped because the whole document isn't wrapped
    expect(markdown).toContain('```');
    expect(markdown).toContain('code snippet');
  });

  // ── NFC normalisation ──────────────────────────────────────────────────────

  it('NFC normalisation preserves ã, ç, ê, ô accented characters', () => {
    // Use text that contains all four target diacritics
    const raw = 'ação côte façade lêde';
    const { markdown } = postprocessMarkdown(raw);
    // Characters should survive normalisation intact
    expect(markdown).toContain('ã');
    expect(markdown).toContain('ç');
    expect(markdown).toContain('ê');
    expect(markdown).toContain('ô');
  });

  it('NFC normalisation output equals the NFC form of the input', () => {
    const withDiacritics = 'café naïve résumé';
    // Decomposed NFD form of 'é' is e + combining accent
    const nfd = withDiacritics.normalize('NFD');
    const { markdown } = postprocessMarkdown(nfd);
    expect(markdown.normalize('NFC')).toBe(withDiacritics.normalize('NFC'));
  });

  // ── Word count ────────────────────────────────────────────────────────────

  it('wordCount excludes pure markdown syntax tokens (##, ###, **, ==, |, -)', () => {
    // 5 real words: "Introduction", "Topic", "item", "one", "data"
    const raw = '## Introduction\n### Topic\n- item one\n| data |';
    const { wordCount } = postprocessMarkdown(raw);
    // "Introduction" (1), "Topic" (1), "item" (1), "one" (1), "data" (1) = 5
    expect(wordCount).toBe(5);
  });

  it('wordCount counts words wrapped in ==term== once', () => {
    const raw = '==highlighted== is a ==term==';
    const { wordCount } = postprocessMarkdown(raw);
    // "highlighted", "is", "a", "term" = 4 words
    expect(wordCount).toBe(4);
  });

  it('wordCount counts words wrapped in **bold** once', () => {
    const raw = '**bold** and **another bold phrase**';
    const { wordCount } = postprocessMarkdown(raw);
    // "bold", "and", "another", "bold", "phrase" = 5 words
    expect(wordCount).toBe(5);
  });

  it('wordCount excludes standalone ordered-list markers like 1. and 2.', () => {
    const raw = '1. First item\n2. Second item\n3. Third item';
    const { wordCount } = postprocessMarkdown(raw);
    // "First", "item", "Second", "item", "Third", "item" = 6 words (no list markers)
    expect(wordCount).toBe(6);
  });

  it('wordCount counts mixed content with headings, bullets, and real words correctly', () => {
    // ## (excluded), Introduction (1), - (excluded), point (2), one (3), | (excluded), cell (4) |
    const raw = '## Introduction\n- point one\n| cell |';
    const { wordCount } = postprocessMarkdown(raw);
    expect(wordCount).toBe(4);
  });

  // ── OCR confidence ────────────────────────────────────────────────────────

  it('computes correct ocrConfidence for known [?] count over known wordCount', () => {
    // 8 real words + 2 illegible markers.
    // [?] tokens have no alphanumeric chars so they are NOT counted in wordCount.
    // wordCount = 8, unknownCount = 2 → confidence = round((1 - 2/8)*100) = round(75) = 75
    const raw = 'word1 word2 [?] word4 word5 word6 word7 [?] word9 word10';
    const { wordCount, ocrConfidence } = postprocessMarkdown(raw);
    expect(wordCount).toBe(8);
    expect(ocrConfidence).toBe(75);
  });

  it('returns ocrConfidence === 100 when wordCount === 0 (no divide-by-zero)', () => {
    const { wordCount, ocrConfidence } = postprocessMarkdown('');
    expect(wordCount).toBe(0);
    expect(ocrConfidence).toBe(100);
  });

  it('returns ocrConfidence === 100 when no [?] markers are present', () => {
    const raw = 'This is a clean transcription with no illegible words.';
    const { ocrConfidence } = postprocessMarkdown(raw);
    expect(ocrConfidence).toBe(100);
  });

  it('clamps ocrConfidence to a minimum of 0', () => {
    // More [?] markers than words is unusual but we clamp at 0
    const raw = '[?] [?] [?]';
    const { ocrConfidence } = postprocessMarkdown(raw);
    expect(ocrConfidence).toBeGreaterThanOrEqual(0);
    expect(ocrConfidence).toBeLessThanOrEqual(100);
  });

  // ── Language detection ────────────────────────────────────────────────────

  it('detects pt-BR → en when Brazilian-Portuguese diacritics are present', () => {
    const raw = 'ação não subjuntivo verbos importantes';
    const { detectedLang } = postprocessMarkdown(raw);
    expect(detectedLang).toBe('pt-BR → en');
  });

  it('detects pt-BR → en for ç diacritic', () => {
    const { detectedLang } = postprocessMarkdown('façade pronunciation');
    expect(detectedLang).toBe('pt-BR → en');
  });

  it('detects pt-BR → en for ê diacritic', () => {
    const { detectedLang } = postprocessMarkdown('lêde têmpero');
    expect(detectedLang).toBe('pt-BR → en');
  });

  it('detects pt-BR → en for ô diacritic', () => {
    const { detectedLang } = postprocessMarkdown('avô côte');
    expect(detectedLang).toBe('pt-BR → en');
  });

  it('returns "unknown" when no diacritics are present (plain English)', () => {
    const raw = 'This is plain English text without any special characters.';
    const { detectedLang } = postprocessMarkdown(raw);
    expect(detectedLang).toBe('unknown');
  });

  // ── Integration / combined ────────────────────────────────────────────────

  it('strips a preamble from content that is entirely wrapped in a code fence', () => {
    // The whole raw string is wrapped in a fence (preamble inside the fence) — fence stripped first,
    // then preamble stripped from the unwrapped content.
    const raw = '```markdown\nHere is the transcription:\n\n## Biology Notes\nCell structure.\n```';
    const { markdown } = postprocessMarkdown(raw);
    expect(markdown).toContain('## Biology Notes');
    expect(markdown).not.toContain('```');
    expect(markdown).not.toMatch(/Here is the transcription/i);
  });

  it('handles whitespace-only input gracefully', () => {
    const { markdown, wordCount, ocrConfidence } = postprocessMarkdown('   \n\n   ');
    expect(wordCount).toBe(0);
    expect(ocrConfidence).toBe(100);
    expect(markdown.trim()).toBe('');
  });
});
