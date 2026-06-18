import { tmpdir } from 'node:os';
import { writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { SourceFormat } from '../db/sources.js';

// ---------------------------------------------------------------------------
// Post-processing helpers
// ---------------------------------------------------------------------------

/**
 * Applies shared post-processing to all extracted text:
 * 1. Unicode NFC normalization
 * 2. Collapse runs of 2+ blank lines to a single blank line
 * 3. Trim leading/trailing whitespace
 */
function postProcess(text: string): string {
  return text
    .normalize('NFC')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse raw document bytes for the given format into normalized plain-text / Markdown.
 *
 * Does NOT prepend a title heading — call `withTitleHeading` for that.
 * Post-processing applied to all formats: Unicode NFC normalization + collapse
 * runs of 2+ blank lines to a single blank line + trim.
 * Throws on unknown format.
 */
export async function parseDocument(format: SourceFormat, buffer: Buffer): Promise<string> {
  let raw: string;

  switch (format) {
    case 'pdf': {
      // `unpdf` wraps the maintained pdf.js (serverless build) and works on
      // Node 22 / Lambda with no native deps. (The older `pdf-parse` bundles an
      // ancient pdf.js build — v1.10.100 — that throws "bad XRef entry" /
      // "Invalid PDF structure" on Node 22 for even valid PDFs, so it is NOT
      // usable here.) Dynamic import keeps the heavy lib out of the module graph
      // until a PDF is actually parsed.
      const { getDocumentProxy, extractText } = await import('unpdf');
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const { text } = await extractText(pdf, { mergePages: true });
      raw = text;
      break;
    }

    case 'docx': {
      // mammoth's type definitions are incomplete — `convertToMarkdown` is not
      // declared in `lib/index.d.ts` but is exported at runtime (same signature
      // as `convertToHtml`). Cast to `any` to satisfy the type checker.
      const mammoth = await import('mammoth');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { value } = await (mammoth as any).convertToMarkdown({ buffer });
      raw = value as string;
      break;
    }

    case 'epub': {
      raw = await parseEpub(buffer);
      break;
    }

    case 'txt':
    case 'md': {
      raw = buffer.toString('utf-8');
      break;
    }

    default: {
      throw new Error(`parseDocument: unsupported format "${format as string}"`);
    }
  }

  return postProcess(raw);
}

/**
 * Parse an EPUB buffer into plain text.
 *
 * epub2 does not support Buffer input directly — write to a temp file, parse by
 * path, then clean up.
 *
 * The epub2 `EPub.createAsync` static method accepts a file path and returns a
 * Promise<EPub>. The `epub.flow` array contains spine items with `id?: string`;
 * `getChapterRawAsync(id)` returns the raw HTML for that spine item.
 */
async function parseEpub(buffer: Buffer): Promise<string> {
  const { EPub } = await import('epub2');

  const tmpPath = join(
    tmpdir(),
    `tmn-epub-${Date.now()}-${Math.random().toString(36).slice(2)}.epub`,
  );
  await writeFile(tmpPath, buffer);

  try {
    const epub = await EPub.createAsync(tmpPath);
    const chapters: string[] = [];

    for (const item of epub.flow) {
      if (!item.id) continue;
      try {
        // getChapterRawAsync returns the raw HTML for the spine item
        const html: string = await epub.getChapterRawAsync(item.id);
        // Strip HTML tags to get plain text
        const text = html
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          // Unescape &amp; LAST so a literal "&amp;lt;" is not double-unescaped
          // into "<" (the other entity replacements run before this). Flagged by
          // CodeQL "Double escaping or unescaping".
          .replace(/&amp;/g, '&')
          .replace(/\s+/g, ' ')
          .trim();
        if (text) {
          chapters.push(text);
        }
      } catch {
        // Skip unreadable chapters
      }
    }

    return chapters.join('\n\n');
  } finally {
    await unlink(tmpPath).catch(() => undefined);
  }
}

/**
 * Prepend a `# <title>` Markdown heading to extracted text.
 * Skips prepending if the text already starts with that exact heading.
 */
export function withTitleHeading(text: string, title: string): string {
  const heading = `# ${title}`;
  if (text.startsWith(heading)) {
    return text;
  }
  return `${heading}\n\n${text}`;
}

/**
 * Count whitespace-delimited words in a string.
 * Empty or whitespace-only strings return 0.
 */
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}
