import { parseHTML } from 'linkedom';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import { countWords } from './parse.js';

export interface ExtractedArticle {
  title: string;
  markdown: string;
  byline?: string;
  excerpt?: string;
  wordCount: number;
}

export const MAX_EXTRACTED_CHARS = 80_000;

/**
 * Minimum trimmed text length (in characters) an extracted article must have to
 * be considered readable. Readability happily "extracts" trivial markup, so we
 * reject anything below this floor as having no real article content.
 */
export const MIN_ARTICLE_TEXT_CHARS = 32;

// Readability expects a DOM Document. linkedom's document is compatible at
// runtime but TypeScript doesn't know about the DOM types in this package
// (types: ["node"] only). Use a local alias to avoid referencing the global
// `Document` type that isn't in scope here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DOMDocument = any;

export function extractArticle(html: string, _baseUrl: string): ExtractedArticle {
  const { document } = parseHTML(html);
  const article = new Readability(document as DOMDocument).parse();

  // Readability returns a non-null result even for trivial markup (e.g. a lone
  // `<p>x</p>`), so guard on the extracted text actually carrying meaningful
  // content — a real article yields hundreds-to-thousands of chars, while junk
  // pages yield a handful. MIN_ARTICLE_TEXT_CHARS separates the two.
  const textLength = (article?.textContent ?? '').trim().length;
  if (!article || !article.content || textLength < MIN_ARTICLE_TEXT_CHARS) {
    throw new Error('extractArticle: could not extract a readable article');
  }

  const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
  let markdown = td.turndown(article.content);

  // Cap to MAX_EXTRACTED_CHARS
  if (markdown.length > MAX_EXTRACTED_CHARS) {
    markdown = markdown.slice(0, MAX_EXTRACTED_CHARS);
  }

  // Title: article.title -> <title> tag -> fallback
  let title = (article.title ?? '').trim();
  if (!title) {
    const titleEl = document.querySelector('title');
    title = (titleEl?.textContent ?? '').trim() || 'Untitled article';
  }

  const wordCount = countWords(markdown);

  const result: ExtractedArticle = { title, markdown, wordCount };
  if (article.byline) result.byline = article.byline;
  if (article.excerpt) result.excerpt = article.excerpt;

  return result;
}
