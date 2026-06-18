import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { parseDocument, withTitleHeading, countWords } from '../parse.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const fixtureDir = join(__dirname, 'fixtures');

describe('parseDocument', () => {
  it('parses a PDF and returns non-empty text', async () => {
    const buf = readFileSync(join(fixtureDir, 'sample.pdf'));
    const text = await parseDocument('pdf', buf);
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain('Hello');
  });

  it('parses a DOCX and returns non-empty text', async () => {
    const buf = readFileSync(join(fixtureDir, 'sample.docx'));
    const text = await parseDocument('docx', buf);
    expect(text.length).toBeGreaterThan(0);
  });

  it('parses an EPUB and returns non-empty text', async () => {
    const buf = readFileSync(join(fixtureDir, 'sample.epub'));
    const text = await parseDocument('epub', buf);
    expect(text.length).toBeGreaterThan(0);
  });

  it('passes through TXT content', async () => {
    const content = 'Hello world\nLine two';
    const buf = Buffer.from(content, 'utf-8');
    const text = await parseDocument('txt', buf);
    expect(text).toBe('Hello world\nLine two');
  });

  it('passes through MD content', async () => {
    const content = '# Heading\n\nSome text.';
    const buf = Buffer.from(content, 'utf-8');
    const text = await parseDocument('md', buf);
    expect(text).toBe('# Heading\n\nSome text.');
  });

  it('throws on unknown format', async () => {
    await expect(parseDocument('xyz' as any, Buffer.from(''))).rejects.toThrow();
  });
});

describe('withTitleHeading', () => {
  it('prepends a # heading', () => {
    expect(withTitleHeading('Some text', 'My Title')).toBe('# My Title\n\nSome text');
  });

  it('does not double-prepend when heading already present', () => {
    const text = '# My Title\n\nSome text';
    expect(withTitleHeading(text, 'My Title')).toBe(text);
  });

  it('prepends when a different heading is present', () => {
    const text = '# Other Title\n\nSome text';
    const result = withTitleHeading(text, 'My Title');
    expect(result).toContain('# My Title');
    expect(result).toContain('# Other Title');
  });
});

describe('countWords', () => {
  it('counts words', () => {
    expect(countWords('hello world foo')).toBe(3);
  });

  it('returns 0 for empty string', () => {
    expect(countWords('')).toBe(0);
  });

  it('returns 0 for whitespace-only', () => {
    expect(countWords('   \n  ')).toBe(0);
  });

  it('handles extra whitespace between words', () => {
    expect(countWords('  hello   world  ')).toBe(2);
  });
});
