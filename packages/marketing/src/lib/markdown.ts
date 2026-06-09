/**
 * markdown.ts — dependency-free Markdown → safe HTML renderer.
 *
 * Heading mapping decision:
 *   The changelog page has ONE <h1> (the page title). Release-note bodies
 *   are rendered inside <article> elements whose version heading is already
 *   an <h2>. To keep the logical outline intact we map:
 *     ##  → <h3>   (release-note section heading — sits under the <h2> version)
 *     ### → <h4>   (subsection)
 *     #### → <h5>  (deep subsection)
 *   We intentionally DO NOT emit <h1> or <h2> from body markdown so the
 *   page's single <h1> and the per-entry <h2> version headings are never
 *   duplicated.
 *
 * Security model:
 *   All input is HTML-escaped before any transformation. Inline patterns
 *   that emit HTML (links, code) are constructed by this function from
 *   escaped pieces — raw HTML passthrough is impossible.
 *   Link URLs are sanitised: only http/https/mailto/relative are allowed;
 *   javascript: and other schemes are replaced with "#".
 */

// ---------------------------------------------------------------------------
// HTML escaping — must happen first, before any pattern replacement
// ---------------------------------------------------------------------------

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------------
// URL sanitisation
// ---------------------------------------------------------------------------

function sanitiseUrl(raw: string): string {
  const trimmed = raw.trim();
  // Allow relative URLs (start with /, ./, ../, or no scheme)
  if (/^(https?:|mailto:|\/|\.\.?\/)/i.test(trimmed)) {
    return trimmed;
  }
  // Allow anchor links
  if (trimmed.startsWith('#')) {
    return trimmed;
  }
  // Block javascript: and other dangerous schemes
  if (/^[a-z][a-z0-9+\-.]*:/i.test(trimmed)) {
    return '#';
  }
  // Relative path without explicit prefix — allow
  return trimmed;
}

// ---------------------------------------------------------------------------
// Inline rendering (runs on already-escaped text)
// ---------------------------------------------------------------------------

function renderInline(escaped: string): string {
  // Bold: **text** — use a lookahead to avoid runaway matches
  let out = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Inline code: `code` — content is re-escaped for safety (it's already
  // HTML-escaped from the source, but the delimiter itself may have been
  // escaped, so we work with the escaped form)
  out = out.replace(/`([^`]+)`/g, (_m, code) => `<code>${code}</code>`);

  // Links: [text](url)
  // Note: text is already HTML-escaped; URL comes from source and must be sanitised.
  // Because the source was HTML-escaped, parentheses in URLs will appear as-is.
  out = out.replace(/\[([^\]]*)\]\(([^)]*)\)/g, (_m, linkText, rawUrl) => {
    const safe = sanitiseUrl(rawUrl);
    const isExternal = /^https?:/i.test(safe);
    const rel = isExternal ? ' rel="noopener noreferrer" target="_blank"' : '';
    return `<a href="${escapeHtml(safe)}"${rel}>${linkText}</a>`;
  });

  return out;
}

// ---------------------------------------------------------------------------
// Block rendering
// ---------------------------------------------------------------------------

type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'p'; text: string }
  | { kind: 'blank' };

function parseBlocks(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Blank line
    if (line.trim() === '') {
      blocks.push({ kind: 'blank' });
      i++;
      continue;
    }

    // ATX heading: ## / ### / ####
    const headingMatch = line.match(/^(#{2,4})\s+(.+)/);
    if (headingMatch) {
      const hashes = headingMatch[1].length;
      // Map: ## → h3, ### → h4, #### → h5
      const level = hashes + 1;
      blocks.push({ kind: 'heading', level, text: headingMatch[2].trim() });
      i++;
      continue;
    }

    // Unordered list item: "- " or "* "
    if (/^[-*]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, '').trim());
        i++;
      }
      blocks.push({ kind: 'ul', items });
      continue;
    }

    // Paragraph — accumulate until blank line or structure change
    const paragraphLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^#{2,4}\s/.test(lines[i]) &&
      !/^[-*]\s/.test(lines[i])
    ) {
      paragraphLines.push(lines[i]);
      i++;
    }
    if (paragraphLines.length > 0) {
      blocks.push({ kind: 'p', text: paragraphLines.join(' ').trim() });
    }
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render a Markdown string to a safe HTML string.
 *
 * - All input is HTML-escaped before transformation.
 * - Only a constrained Markdown subset is emitted — no raw HTML passthrough.
 * - Returns "" for empty/whitespace-only input.
 */
export function renderMarkdown(md: string): string {
  if (!md || md.trim() === '') return '';

  const lines = md.split('\n');

  // First pass: escape all lines
  const escapedLines = lines.map(escapeHtml);

  const blocks = parseBlocks(escapedLines);

  const parts: string[] = [];

  for (const block of blocks) {
    if (block.kind === 'blank') continue;

    if (block.kind === 'heading') {
      const text = renderInline(block.text);
      parts.push(`<h${block.level}>${text}</h${block.level}>`);
      continue;
    }

    if (block.kind === 'ul') {
      const items = block.items
        .map((item) => `<li>${renderInline(item)}</li>`)
        .join('\n');
      parts.push(`<ul>\n${items}\n</ul>`);
      continue;
    }

    if (block.kind === 'p') {
      const text = renderInline(block.text);
      parts.push(`<p>${text}</p>`);
    }
  }

  return parts.join('\n');
}
