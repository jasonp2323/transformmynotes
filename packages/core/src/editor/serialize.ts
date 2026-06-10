/**
 * Markdown ↔ TipTap JSONContent serialization.
 *
 * Pure function — no AWS, no I/O, no remark/unified.
 * Supports the markdown dialect used by transformmynotes (see .design/app/ds-helpers.jsx).
 */

import type { JSONContent } from '@tiptap/core';

// ─── Types ───────────────────────────────────────────────────────────────────

/** A single inline mark: bold, italic, code, or highlight. */
type InlineMark = 'bold' | 'italic' | 'code' | 'highlight';

/** A segment of inline-parsed text with associated marks. */
interface InlineSegment {
  text: string;
  marks: InlineMark[];
}

// ─── Inline tokenizer ────────────────────────────────────────────────────────

/**
 * Parse inline markdown into segments.
 * Supported: ==highlight==, **bold**, *italic*, `code`
 * Mark order for nesting: innermost-first when writing → code, italic, bold, highlight
 *
 * Code spans are treated as literal — no inner mark parsing.
 */
function parseInline(input: string): InlineSegment[] {
  const segments: InlineSegment[] = [];

  function parse(s: string, activeMarks: InlineMark[]): void {
    if (s === '') return;

    // Code — literal content, no inner parsing
    const codeMatch = s.match(/^(.*?)`([^`]+?)`(.*)/s);
    if (codeMatch) {
      const [, before, content, after] = codeMatch;
      parse(before, activeMarks);
      segments.push({ text: content, marks: [...activeMarks, 'code'] });
      parse(after, activeMarks);
      return;
    }

    // Highlight ==...== (must come before bold to correctly handle ==**x**==)
    const hlMatch = s.match(/^(.*?)==(.+?)==(.*)/s);
    // Bold+italic ***...*** must be matched before bold ** to avoid consuming the outer *
    const boldItalicMatch = s.match(/^(.*?)\*\*\*(.+?)\*\*\*(.*)/s);
    // Bold **...**  (only if not part of ***)
    const boldMatch = s.match(/^(.*?)(?<!\*)\*\*(?!\*)(.+?)(?<!\*)\*\*(?!\*)(.*)/s);
    // Italic *...*  (not part of ** or ***)
    const italicMatch = s.match(/^(.*?)(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)(.*)/s);

    // Find which match occurs earliest (shortest "before" group)
    type MatchInfo = { before: string; content: string; after: string; marks: InlineMark[] };
    const candidates: MatchInfo[] = [];

    if (hlMatch) {
      candidates.push({ before: hlMatch[1], content: hlMatch[2], after: hlMatch[3], marks: ['highlight'] });
    }
    if (boldItalicMatch) {
      candidates.push({ before: boldItalicMatch[1], content: boldItalicMatch[2], after: boldItalicMatch[3], marks: ['bold', 'italic'] });
    }
    if (boldMatch) {
      candidates.push({ before: boldMatch[1], content: boldMatch[2], after: boldMatch[3], marks: ['bold'] });
    }
    if (italicMatch) {
      candidates.push({ before: italicMatch[1], content: italicMatch[2], after: italicMatch[3], marks: ['italic'] });
    }

    if (candidates.length === 0) {
      // No more marks — emit plain text
      if (s !== '') {
        segments.push({ text: s, marks: [...activeMarks] });
      }
      return;
    }

    // Pick the candidate whose "before" group is shortest (earliest in string)
    // Tie-break: prefer longer delimiter (boldItalic > bold > italic) so *** wins over **
    candidates.sort((a, b) => {
      if (a.before.length !== b.before.length) return a.before.length - b.before.length;
      return b.marks.length - a.marks.length; // more marks = longer delimiter wins
    });
    const winner = candidates[0];

    // Emit the text before the match
    if (winner.before !== '') {
      parse(winner.before, activeMarks);
    }

    // Emit the matched content with the new marks added
    parse(winner.content, [...activeMarks, ...winner.marks]);

    // Continue with the rest of the string
    parse(winner.after, activeMarks);
  }

  parse(input, []);
  return segments;
}

/**
 * Convert InlineSegments to TipTap text nodes.
 */
function segmentsToNodes(segments: InlineSegment[]): JSONContent[] {
  if (segments.length === 0) return [];
  return segments.map((seg) => {
    const node: JSONContent = { type: 'text', text: seg.text };
    if (seg.marks.length > 0) {
      node.marks = seg.marks.map((m) => ({ type: m }));
    }
    return node;
  });
}

/**
 * Parse inline text and return TipTap inline nodes.
 */
function parseInlineNodes(text: string): JSONContent[] {
  const segments = parseInline(text);
  return segmentsToNodes(segments);
}

// ─── Block parser ─────────────────────────────────────────────────────────────

const RE_BLANK = /^\s*$/;
const RE_HEADING = /^(#{1,4})\s+(.*)$/;
const RE_HR = /^\s*---+\s*$/;
const RE_BLOCKQUOTE = /^\s*>\s?/;
const RE_BULLET = /^\s*[-*]\s+/;
const RE_ORDERED = /^\s*\d+\.\s+/;
const RE_TABLE = /^\s*\|/;

/**
 * Parse a full markdown string into a TipTap JSONContent document.
 */
export function markdownToDoc(md: string): JSONContent {
  const lines = (md ?? '').replace(/\r/g, '').split('\n');
  const blocks: JSONContent[] = [];
  let i = 0;

  function isBlank(l: string): boolean {
    return RE_BLANK.test(l);
  }

  while (i < lines.length) {
    const line = lines[i];

    // Skip blank lines
    if (isBlank(line)) {
      i++;
      continue;
    }

    // Heading
    const headingMatch = line.match(RE_HEADING);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      blocks.push({
        type: 'heading',
        attrs: { level },
        content: parseInlineNodes(text),
      });
      i++;
      continue;
    }

    // Horizontal rule
    if (RE_HR.test(line)) {
      blocks.push({ type: 'horizontalRule' });
      i++;
      continue;
    }

    // Table
    if (RE_TABLE.test(line)) {
      const tableLines: string[] = [];
      while (i < lines.length && RE_TABLE.test(lines[i])) {
        tableLines.push(lines[i]);
        i++;
      }
      blocks.push(parseTable(tableLines));
      continue;
    }

    // Blockquote
    if (RE_BLOCKQUOTE.test(line)) {
      const bqLines: string[] = [];
      while (i < lines.length && RE_BLOCKQUOTE.test(lines[i])) {
        bqLines.push(lines[i].replace(RE_BLOCKQUOTE, ''));
        i++;
      }
      const combined = bqLines.join(' ');
      blocks.push({
        type: 'blockquote',
        content: [
          {
            type: 'paragraph',
            content: parseInlineNodes(combined),
          },
        ],
      });
      continue;
    }

    // Bullet list
    if (RE_BULLET.test(line)) {
      const items: string[] = [];
      while (i < lines.length && RE_BULLET.test(lines[i])) {
        items.push(lines[i].replace(RE_BULLET, ''));
        i++;
      }
      blocks.push({
        type: 'bulletList',
        content: items.map((item) => ({
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: parseInlineNodes(item),
            },
          ],
        })),
      });
      continue;
    }

    // Ordered list
    if (RE_ORDERED.test(line)) {
      const items: string[] = [];
      while (i < lines.length && RE_ORDERED.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      blocks.push({
        type: 'orderedList',
        content: items.map((item) => ({
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: parseInlineNodes(item),
            },
          ],
        })),
      });
      continue;
    }

    // Paragraph — gather non-structural consecutive lines
    const buf: string[] = [];
    while (
      i < lines.length &&
      !isBlank(lines[i]) &&
      !RE_HEADING.test(lines[i]) &&
      !RE_HR.test(lines[i]) &&
      !RE_TABLE.test(lines[i]) &&
      !RE_BLOCKQUOTE.test(lines[i]) &&
      !RE_BULLET.test(lines[i]) &&
      !RE_ORDERED.test(lines[i])
    ) {
      buf.push(lines[i]);
      i++;
    }
    if (buf.length > 0) {
      blocks.push({
        type: 'paragraph',
        content: parseInlineNodes(buf.join(' ')),
      });
    }
  }

  return { type: 'doc', content: blocks };
}

/**
 * Parse a set of table lines into a TipTap table node.
 * Row 0 = header, row 1 = separator (skipped), rows 2+ = body.
 */
function parseTable(tableLines: string[]): JSONContent {
  function parseCells(row: string): string[] {
    return row
      .replace(/^\s*\|/, '')
      .replace(/\|\s*$/, '')
      .split('|')
      .map((c) => c.trim());
  }

  function isSeparatorRow(row: string): boolean {
    return /^\s*\|[\s|:-]+\|\s*$/.test(row);
  }

  const rows: JSONContent[] = [];

  for (let r = 0; r < tableLines.length; r++) {
    const rawRow = tableLines[r];
    if (isSeparatorRow(rawRow)) continue;

    const cells = parseCells(rawRow);
    const isHeader = r === 0;
    const cellType = isHeader ? 'tableHeader' : 'tableCell';

    rows.push({
      type: 'tableRow',
      content: cells.map((cellText) => ({
        type: cellType,
        content: [
          {
            type: 'paragraph',
            content: parseInlineNodes(cellText),
          },
        ],
      })),
    });
  }

  return { type: 'table', content: rows };
}

// ─── Doc → Markdown ───────────────────────────────────────────────────────────

/**
 * Canonical mark wrap order (outermost last = wraps first from inside out):
 * innermost: code → italic → bold → highlight (outermost)
 * So the serialized form for bold+italic is ***x***, for bold+highlight is ==**x**==
 */
const MARK_ORDER: InlineMark[] = ['code', 'italic', 'bold', 'highlight'];

function markRank(m: InlineMark): number {
  return MARK_ORDER.indexOf(m);
}

/**
 * Serialize inline text nodes back to markdown.
 */
function inlineNodesToMarkdown(nodes: JSONContent[]): string {
  if (!nodes || nodes.length === 0) return '';

  // Collect segments
  const segs: InlineSegment[] = nodes.map((node) => {
    const text = node.text ?? '';
    const marks: InlineMark[] = (node.marks ?? []).map((m) => m.type as InlineMark);
    return { text, marks };
  });

  // Merge adjacent segments with identical mark sets
  const merged: InlineSegment[] = [];
  for (const seg of segs) {
    if (
      merged.length > 0 &&
      JSON.stringify([...merged[merged.length - 1].marks].sort()) ===
        JSON.stringify([...seg.marks].sort())
    ) {
      merged[merged.length - 1] = {
        text: merged[merged.length - 1].text + seg.text,
        marks: merged[merged.length - 1].marks,
      };
    } else {
      merged.push({ text: seg.text, marks: [...seg.marks] });
    }
  }

  return merged.map((seg) => applyMarks(seg.text, seg.marks)).join('');
}

/**
 * Wrap text with mark delimiters, applying from innermost to outermost.
 * Canonical order: code (innermost) → italic → bold → highlight (outermost)
 */
function applyMarks(text: string, marks: InlineMark[]): string {
  // Sort marks by their canonical rank (lowest rank = innermost)
  const sorted = [...marks].sort((a, b) => markRank(a) - markRank(b));
  let result = text;
  for (const mark of sorted) {
    switch (mark) {
      case 'code':
        result = `\`${result}\``;
        break;
      case 'italic':
        result = `*${result}*`;
        break;
      case 'bold':
        result = `**${result}**`;
        break;
      case 'highlight':
        result = `==${result}==`;
        break;
    }
  }
  return result;
}

/**
 * Extract plain text from a paragraph/inline node tree.
 */
function extractInlineText(node: JSONContent): string {
  if (!node.content) return '';
  return inlineNodesToMarkdown(node.content);
}

/**
 * Serialize a TipTap JSONContent document to markdown.
 */
export function docToMarkdown(doc: JSONContent): string {
  if (!doc.content || doc.content.length === 0) return '';

  const parts: string[] = [];

  for (const node of doc.content) {
    const md = blockToMarkdown(node);
    if (md !== null) {
      parts.push(md);
    }
  }

  return parts.join('\n\n') + '\n';
}

/**
 * Serialize a single block node to its markdown string (no surrounding blank lines).
 */
function blockToMarkdown(node: JSONContent): string | null {
  switch (node.type) {
    case 'heading': {
      const level = (node.attrs?.level as number) ?? 2;
      const prefix = '#'.repeat(level);
      const text = extractInlineText(node);
      return `${prefix} ${text}`;
    }

    case 'paragraph': {
      if (!node.content || node.content.length === 0) return '';
      return inlineNodesToMarkdown(node.content);
    }

    case 'horizontalRule':
      return '---';

    case 'blockquote': {
      // Join all paragraphs within the blockquote
      const lines: string[] = (node.content ?? []).map((child) => {
        if (child.type === 'paragraph') {
          return extractInlineText(child);
        }
        return blockToMarkdown(child) ?? '';
      });
      return '> ' + lines.join(' ');
    }

    case 'bulletList': {
      const items = (node.content ?? []).map((item) => {
        const text = listItemText(item);
        return `- ${text}`;
      });
      return items.join('\n');
    }

    case 'orderedList': {
      const items = (node.content ?? []).map((item, idx) => {
        const text = listItemText(item);
        return `${idx + 1}. ${text}`;
      });
      return items.join('\n');
    }

    case 'table': {
      return tableToMarkdown(node);
    }

    default:
      return null;
  }
}

/**
 * Extract text from a listItem node.
 */
function listItemText(item: JSONContent): string {
  if (!item.content) return '';
  // listItem > paragraph
  const parts = item.content.map((child) => {
    if (child.type === 'paragraph') {
      return extractInlineText(child);
    }
    return blockToMarkdown(child) ?? '';
  });
  return parts.join(' ');
}

/**
 * Serialize a table node to markdown.
 */
function tableToMarkdown(table: JSONContent): string {
  const rows = table.content ?? [];
  if (rows.length === 0) return '';

  const renderedRows: string[][] = rows.map((row) =>
    (row.content ?? []).map((cell) => {
      const para = (cell.content ?? []).find((n) => n.type === 'paragraph');
      return para ? extractInlineText(para) : '';
    }),
  );

  // Determine column count from the first row
  const colCount = renderedRows[0]?.length ?? 0;
  const separator = Array(colCount).fill('---');

  const lines: string[] = [];
  // Header row (first row)
  lines.push('| ' + renderedRows[0].join(' | ') + ' |');
  // Separator
  lines.push('| ' + separator.join(' | ') + ' |');
  // Body rows
  for (let r = 1; r < renderedRows.length; r++) {
    lines.push('| ' + renderedRows[r].join(' | ') + ' |');
  }

  return lines.join('\n');
}

// ─── Normalisation ────────────────────────────────────────────────────────────

/**
 * Normalise a markdown string for round-trip comparison:
 * - Strip leading/trailing whitespace per line
 * - Collapse multiple consecutive blank lines to one
 * - Ensure exactly one trailing newline
 */
export function normalise(md: string): string {
  const lines = md.replace(/\r/g, '').split('\n').map((l) => l.trimEnd());

  // Collapse consecutive blank lines to one
  const collapsed: string[] = [];
  let prevBlank = false;
  for (const line of lines) {
    const blank = /^\s*$/.test(line);
    if (blank && prevBlank) continue;
    collapsed.push(blank ? '' : line);
    prevBlank = blank;
  }

  // Remove leading blank lines
  while (collapsed.length > 0 && collapsed[0] === '') {
    collapsed.shift();
  }
  // Remove trailing blank lines
  while (collapsed.length > 0 && collapsed[collapsed.length - 1] === '') {
    collapsed.pop();
  }

  if (collapsed.length === 0) return '';
  return collapsed.join('\n') + '\n';
}
