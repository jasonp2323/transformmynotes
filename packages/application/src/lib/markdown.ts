/**
 * M1 pure markdown → HTML renderer.
 * Output is consumed via `dangerouslySetInnerHTML` inside a `.md-body` container.
 * No DOM APIs, no async, no side effects — safe to call in any environment.
 */

/** Escape HTML special characters to entities. */
function mdEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Apply inline formatting to a plain-text span.
 * Order: escape → highlight → bold → code → italic.
 */
function mdInline(s: string): string {
  s = mdEscape(s);
  s = s.replace(/==(.+?)==/g, '<mark class="md-hl">$1</mark>');
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/`([^`]+?)`/g, '<code class="md-code">$1</code>');
  s = s.replace(/(^|[^*])\*([^*]+?)\*/g, '$1<em>$2</em>');
  return s;
}

/** Render a collected block of pipe-delimited table lines into an HTML table. */
function mdTable(rows: string[]): string {
  const cells = (r: string): string[] =>
    r
      .replace(/^\s*\|/, '')
      .replace(/\|\s*$/, '')
      .split('|')
      .map((c) => c.trim());

  const head = cells(rows[0]);
  const body = rows.slice(2).map(cells);

  return (
    '<table class="md-table"><thead><tr>' +
    head.map((c) => '<th>' + mdInline(c) + '</th>').join('') +
    '</tr></thead><tbody>' +
    body
      .map((r) => '<tr>' + r.map((c) => '<td>' + mdInline(c) + '</td>').join('') + '</tr>')
      .join('') +
    '</tbody></table>'
  );
}

/**
 * Convert a markdown string to an HTML string.
 *
 * Supported constructs:
 *   # / ## / ###  → h2 / h3 / h4
 *   ==highlight== → <mark class="md-hl">
 *   **bold**      → <strong>
 *   *italic*      → <em>
 *   `code`        → <code class="md-code">
 *   > blockquote
 *   - / * list    → <ul><li>
 *   1. list       → <ol><li>
 *   | table |     → <table class="md-table">
 *   ---           → <hr/>
 *   paragraphs    → <p>
 */
export function renderMarkdown(md: string): string {
  const lines = (md || '').replace(/\r/g, '').split('\n');
  let html = '';
  let i = 0;

  const isBlank = (l: string): boolean => /^\s*$/.test(l);

  while (i < lines.length) {
    const line = lines[i];

    if (isBlank(line)) {
      i++;
      continue;
    }

    // Table block
    if (/^\s*\|/.test(line)) {
      const t: string[] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        t.push(lines[i]);
        i++;
      }
      html += mdTable(t);
      continue;
    }

    // Heading: # / ## / ### → h2 / h3 / h4
    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      const lvl = headingMatch[1].length + 1;
      html += `<h${lvl}>` + mdInline(headingMatch[2]) + `</h${lvl}>`;
      i++;
      continue;
    }

    // Horizontal rule
    if (/^\s*---+\s*$/.test(line)) {
      html += '<hr/>';
      i++;
      continue;
    }

    // Blockquote
    if (/^\s*>\s?/.test(line)) {
      const b: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        b.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      html += '<blockquote>' + mdInline(b.join(' ')) + '</blockquote>';
      continue;
    }

    // Unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i++;
      }
      html += '<ul>' + items.map((x) => '<li>' + mdInline(x) + '</li>').join('') + '</ul>';
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      html += '<ol>' + items.map((x) => '<li>' + mdInline(x) + '</li>').join('') + '</ol>';
      continue;
    }

    // Paragraph (collect non-blank, non-special lines)
    const buf: string[] = [];
    while (
      i < lines.length &&
      !isBlank(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^(#{1,3})\s+/.test(lines[i]) &&
      !/^\s*\|/.test(lines[i]) &&
      !/^\s*>\s?/.test(lines[i]) &&
      !/^\s*---+\s*$/.test(lines[i])
    ) {
      buf.push(lines[i]);
      i++;
    }
    html += '<p>' + mdInline(buf.join(' ')) + '</p>';
  }

  return html;
}
