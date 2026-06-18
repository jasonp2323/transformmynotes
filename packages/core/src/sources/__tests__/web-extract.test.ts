import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { extractArticle, MAX_EXTRACTED_CHARS } from '../web-extract.js';

const fixtureHtml = readFileSync(
  new URL('../../../test/fixtures/article.html', import.meta.url),
  'utf-8',
);

describe('extractArticle', () => {
  it('returns a non-empty title matching the article h1', () => {
    const result = extractArticle(fixtureHtml, 'https://example.com/article');
    expect(result.title).toBeTruthy();
    expect(result.title).toContain('Photosynthesis');
  });

  it('markdown contains the distinctive sentence', () => {
    const result = extractArticle(fixtureHtml, 'https://example.com/article');
    expect(result.markdown).toContain('Photosynthesis converts light energy into chemical energy');
  });

  it('markdown does NOT contain nav junk links', () => {
    const result = extractArticle(fixtureHtml, 'https://example.com/article');
    expect(result.markdown).not.toContain('Login');
    expect(result.markdown).not.toContain('Sign up');
  });

  it('markdown does NOT contain advertisement copy', () => {
    const result = extractArticle(fixtureHtml, 'https://example.com/article');
    expect(result.markdown).not.toContain('Buy now!!!');
  });

  it('wordCount is greater than 0', () => {
    const result = extractArticle(fixtureHtml, 'https://example.com/article');
    expect(result.wordCount).toBeGreaterThan(0);
  });

  it('markdown length never exceeds MAX_EXTRACTED_CHARS', () => {
    // Build a huge HTML doc that would produce > 80000 chars of markdown
    const bigArticle = `
      <html><head><title>Big Article</title></head><body>
      <article>
        <h1>Big Article</h1>
        ${'<p>' + 'word '.repeat(20000) + '</p>'}
      </article>
      </body></html>
    `;
    const result = extractArticle(bigArticle, 'https://example.com/big');
    expect(result.markdown.length).toBeLessThanOrEqual(MAX_EXTRACTED_CHARS);
  });

  it('throws when HTML has no readable article content', () => {
    const bareHtml = '<html><body><p>x</p></body></html>';
    expect(() => extractArticle(bareHtml, 'https://example.com/')).toThrow(
      'could not extract a readable article',
    );
  });
});
