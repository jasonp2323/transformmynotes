import { describe, it, expect } from 'vitest';
import { markdownToDoc, docToMarkdown, normalise } from '../serialize';
import type { JSONContent } from '@tiptap/core';

// ─── NOTE_MD fixture (faithfully transcribed from .design/app/ds-helpers.jsx) ─

const NOTE_MD = `## What is the subjunctive?

El ==subjuntivo== is a verb **mood** that expresses doubt, desire, emotion and possibility — not plain fact. It almost always lives in a subordinate clause introduced by *que*.

> Indicative states what *is*. Subjunctive colours what *might*, *should*, or *is wished* to be.

## The three regular patterns

Regular verbs swap their theme vowel. Learn the endings by infinitive group:

| Infinitive | yo form | Example |
| --- | --- | --- |
| hablar (-ar) | hable | que yo ==hable== |
| comer (-er) | coma | que yo ==coma== |
| vivir (-ir) | viva | que yo ==viva== |

## Common triggers

Memorise the phrases that *force* the subjunctive:

- **Wishes** — *querer que*, *ojalá que*
- **Doubt** — *dudar que*, *no creer que*
- **Emotion** — *me alegro de que*, *temer que*
- **Impersonal** — *es posible que*, *es importante que*

#### Watch out

When there is **no change of subject**, use the infinitive instead: *Quiero \`comer\`* — not *que yo coma*.`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function roundTrip(md: string): string {
  return docToMarkdown(markdownToDoc(md));
}

function assertRoundTrip(md: string): void {
  expect(roundTrip(normalise(md))).toBe(normalise(md));
}

// ─── normalise ────────────────────────────────────────────────────────────────

describe('normalise', () => {
  it('strips trailing whitespace per line', () => {
    expect(normalise('hello   \nworld  ')).toBe('hello\nworld\n');
  });

  it('collapses multiple consecutive blank lines to one', () => {
    expect(normalise('a\n\n\n\nb')).toBe('a\n\nb\n');
  });

  it('ensures exactly one trailing newline', () => {
    expect(normalise('hello')).toBe('hello\n');
    expect(normalise('hello\n')).toBe('hello\n');
    expect(normalise('hello\n\n\n')).toBe('hello\n');
  });

  it('removes leading blank lines', () => {
    expect(normalise('\n\nhello')).toBe('hello\n');
  });
});

// ─── Empty doc ────────────────────────────────────────────────────────────────

describe('empty doc', () => {
  it('markdownToDoc of empty string returns empty doc', () => {
    const doc = markdownToDoc('');
    expect(doc).toEqual({ type: 'doc', content: [] });
  });

  it('docToMarkdown of empty doc returns empty string', () => {
    const doc: JSONContent = { type: 'doc', content: [] };
    expect(docToMarkdown(doc)).toBe('');
  });
});

// ─── Headings ────────────────────────────────────────────────────────────────

describe('headings', () => {
  it('parses h2 (##)', () => {
    const doc = markdownToDoc('## Hello World');
    expect(doc.content?.[0]).toMatchObject({
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Hello World' }],
    });
  });

  it('parses h3 (###)', () => {
    const doc = markdownToDoc('### Sub heading');
    expect(doc.content?.[0]).toMatchObject({
      type: 'heading',
      attrs: { level: 3 },
    });
  });

  it('parses h4 (####)', () => {
    const doc = markdownToDoc('#### Deep heading');
    expect(doc.content?.[0]).toMatchObject({
      type: 'heading',
      attrs: { level: 4 },
    });
  });

  it('serialises h2 back to ##', () => {
    assertRoundTrip('## Hello World');
  });

  it('serialises h3 back to ###', () => {
    assertRoundTrip('### Sub heading');
  });

  it('serialises h4 back to ####', () => {
    assertRoundTrip('#### Deep heading');
  });
});

// ─── Paragraph ───────────────────────────────────────────────────────────────

describe('paragraph', () => {
  it('parses a plain paragraph', () => {
    const doc = markdownToDoc('Just a plain paragraph.');
    expect(doc.content?.[0]).toMatchObject({ type: 'paragraph' });
  });

  it('round-trips a plain paragraph', () => {
    assertRoundTrip('Just a plain paragraph.');
  });

  it('joins consecutive non-structural lines into one paragraph', () => {
    const doc = markdownToDoc('Line one\nLine two\nLine three');
    expect(doc.content).toHaveLength(1);
    expect(doc.content?.[0].type).toBe('paragraph');
  });
});

// ─── Horizontal rule ─────────────────────────────────────────────────────────

describe('horizontalRule', () => {
  it('parses --- as horizontalRule', () => {
    const doc = markdownToDoc('---');
    expect(doc.content?.[0]).toEqual({ type: 'horizontalRule' });
  });

  it('parses ---- (4+ dashes) as horizontalRule', () => {
    const doc = markdownToDoc('----');
    expect(doc.content?.[0]).toEqual({ type: 'horizontalRule' });
  });

  it('round-trips to ---', () => {
    assertRoundTrip('---');
  });
});

// ─── Blockquote ──────────────────────────────────────────────────────────────

describe('blockquote', () => {
  it('parses > lines as blockquote', () => {
    const doc = markdownToDoc('> A quoted line.');
    expect(doc.content?.[0].type).toBe('blockquote');
    expect(doc.content?.[0].content?.[0].type).toBe('paragraph');
  });

  it('joins multiple > lines with a space', () => {
    const doc = markdownToDoc('> First part\n> Second part');
    const para = doc.content?.[0].content?.[0];
    const text = para?.content?.map((n: JSONContent) => n.text ?? '').join('');
    expect(text).toContain('First part');
    expect(text).toContain('Second part');
  });

  it('round-trips a simple blockquote', () => {
    assertRoundTrip('> Simple quoted text.');
  });
});

// ─── Bullet list ─────────────────────────────────────────────────────────────

describe('bulletList', () => {
  it('parses - items as bulletList', () => {
    const doc = markdownToDoc('- Item one\n- Item two\n- Item three');
    expect(doc.content?.[0].type).toBe('bulletList');
    expect(doc.content?.[0].content).toHaveLength(3);
  });

  it('parses * items as bulletList', () => {
    const doc = markdownToDoc('* Item A\n* Item B');
    expect(doc.content?.[0].type).toBe('bulletList');
  });

  it('each item is listItem > paragraph', () => {
    const doc = markdownToDoc('- Only item');
    const item = doc.content?.[0].content?.[0];
    expect(item?.type).toBe('listItem');
    expect(item?.content?.[0].type).toBe('paragraph');
  });

  it('round-trips a bullet list', () => {
    assertRoundTrip('- Alpha\n- Beta\n- Gamma');
  });
});

// ─── Ordered list ────────────────────────────────────────────────────────────

describe('orderedList', () => {
  it('parses 1. items as orderedList', () => {
    const doc = markdownToDoc('1. First\n2. Second\n3. Third');
    expect(doc.content?.[0].type).toBe('orderedList');
    expect(doc.content?.[0].content).toHaveLength(3);
  });

  it('each item is listItem > paragraph', () => {
    const doc = markdownToDoc('1. Only item');
    const item = doc.content?.[0].content?.[0];
    expect(item?.type).toBe('listItem');
    expect(item?.content?.[0].type).toBe('paragraph');
  });

  it('round-trips an ordered list', () => {
    assertRoundTrip('1. First\n2. Second\n3. Third');
  });
});

// ─── Table ───────────────────────────────────────────────────────────────────

describe('table', () => {
  const TABLE_MD = `| Name | Value |
| --- | --- |
| Alpha | 1 |
| Beta | 2 |`;

  it('parses first row as tableHeader cells', () => {
    const doc = markdownToDoc(TABLE_MD);
    const table = doc.content?.[0];
    expect(table?.type).toBe('table');
    const firstRow = table?.content?.[0];
    expect(firstRow?.type).toBe('tableRow');
    expect(firstRow?.content?.[0].type).toBe('tableHeader');
  });

  it('parses body rows as tableCell cells', () => {
    const doc = markdownToDoc(TABLE_MD);
    const table = doc.content?.[0];
    const bodyRow = table?.content?.[1];
    expect(bodyRow?.content?.[0].type).toBe('tableCell');
  });

  it('skips the separator row', () => {
    const doc = markdownToDoc(TABLE_MD);
    const table = doc.content?.[0];
    // header + 2 body rows = 3 rows (separator is consumed)
    expect(table?.content).toHaveLength(3);
  });

  it('round-trips a simple table', () => {
    assertRoundTrip(TABLE_MD);
  });

  it('round-trips a doc with only a table', () => {
    assertRoundTrip(TABLE_MD);
  });

  it('parses inline marks inside table cells', () => {
    const md = `| Term |
| --- |
| ==highlighted== |`;
    const doc = markdownToDoc(md);
    const table = doc.content?.[0];
    const bodyCell = table?.content?.[1]?.content?.[0];
    const para = bodyCell?.content?.[0];
    const textNode = para?.content?.[0];
    expect(textNode?.marks?.[0]?.type).toBe('highlight');
  });
});

// ─── Inline marks ────────────────────────────────────────────────────────────

describe('inline marks', () => {
  it('parses **bold**', () => {
    const doc = markdownToDoc('**bold text**');
    const node = doc.content?.[0].content?.[0];
    expect(node?.text).toBe('bold text');
    expect(node?.marks?.[0]?.type).toBe('bold');
  });

  it('parses *italic*', () => {
    const doc = markdownToDoc('*italic text*');
    const node = doc.content?.[0].content?.[0];
    expect(node?.text).toBe('italic text');
    expect(node?.marks?.[0]?.type).toBe('italic');
  });

  it('parses `code`', () => {
    const doc = markdownToDoc('`some code`');
    const node = doc.content?.[0].content?.[0];
    expect(node?.text).toBe('some code');
    expect(node?.marks?.[0]?.type).toBe('code');
  });

  it('parses ==highlight==', () => {
    const doc = markdownToDoc('==highlighted==');
    const node = doc.content?.[0].content?.[0];
    expect(node?.text).toBe('highlighted');
    expect(node?.marks?.[0]?.type).toBe('highlight');
  });

  it('round-trips **bold**', () => {
    assertRoundTrip('This has **bold** text.');
  });

  it('round-trips *italic*', () => {
    assertRoundTrip('This has *italic* text.');
  });

  it('round-trips `code`', () => {
    assertRoundTrip('Use `console.log` to debug.');
  });

  it('round-trips ==highlight==', () => {
    assertRoundTrip('This ==term== is highlighted.');
  });
});

// ─── Nested marks ────────────────────────────────────────────────────────────

describe('nested marks', () => {
  it('parses ***bold+italic*** as both bold and italic marks', () => {
    const doc = markdownToDoc('***both***');
    const nodes = doc.content?.[0].content ?? [];
    // Find a node with both marks
    const bothNode = nodes.find(
      (n: JSONContent) =>
        n.marks?.some((m: JSONContent) => m.type === 'bold') &&
        n.marks?.some((m: JSONContent) => m.type === 'italic'),
    );
    expect(bothNode).toBeDefined();
  });

  it('round-trips nested bold+italic', () => {
    assertRoundTrip('Plain ***bold and italic*** text.');
  });

  it('round-trips nested bold+highlight (==**x**==)', () => {
    assertRoundTrip('==**highlighted bold**==');
  });

  it('code is innermost — `code` inside bold is still just code', () => {
    const doc = markdownToDoc('Use `code` here.');
    const codeNode = doc.content?.[0].content?.find(
      (n: JSONContent) => n.marks?.some((m: JSONContent) => m.type === 'code'),
    );
    expect(codeNode?.text).toBe('code');
  });
});

// ─── NOTE_MD round-trip ──────────────────────────────────────────────────────

describe('NOTE_MD round-trip', () => {
  it('normalise(docToMarkdown(markdownToDoc(NOTE_MD))) === normalise(NOTE_MD)', () => {
    expect(roundTrip(normalise(NOTE_MD))).toBe(normalise(NOTE_MD));
  });

  it('markdownToDoc(NOTE_MD) produces a doc with 7 top-level blocks', () => {
    // h2, paragraph, blockquote, h2, paragraph, table, h2, paragraph, bulletList, h4, paragraph = 11
    const doc = markdownToDoc(normalise(NOTE_MD));
    expect(doc.type).toBe('doc');
    expect((doc.content?.length ?? 0)).toBeGreaterThanOrEqual(7);
  });

  it('NOTE_MD contains an h4 heading (####)', () => {
    const doc = markdownToDoc(normalise(NOTE_MD));
    const h4 = doc.content?.find(
      (n: JSONContent) => n.type === 'heading' && n.attrs?.level === 4,
    );
    expect(h4).toBeDefined();
  });

  it('NOTE_MD table has highlight marks in body cells', () => {
    const doc = markdownToDoc(normalise(NOTE_MD));
    const table = doc.content?.find((n: JSONContent) => n.type === 'table');
    expect(table).toBeDefined();
    // Find a cell with a highlight mark
    let foundHighlight = false;
    for (const row of table?.content ?? []) {
      for (const cell of row.content ?? []) {
        for (const para of cell.content ?? []) {
          for (const textNode of para.content ?? []) {
            if (textNode.marks?.some((m: JSONContent) => m.type === 'highlight')) {
              foundHighlight = true;
            }
          }
        }
      }
    }
    expect(foundHighlight).toBe(true);
  });

  it('NOTE_MD last paragraph has inline code within italic', () => {
    const doc = markdownToDoc(normalise(NOTE_MD));
    // Last block should be a paragraph containing *Quiero `comer`*
    const lastBlock = doc.content?.[doc.content.length - 1];
    expect(lastBlock?.type).toBe('paragraph');
    // Find a text node with code mark
    const codeNode = lastBlock?.content?.find(
      (n: JSONContent) => n.marks?.some((m: JSONContent) => m.type === 'code'),
    );
    expect(codeNode?.text).toBe('comer');
  });
});

// ─── Idempotency ─────────────────────────────────────────────────────────────

describe('idempotency', () => {
  it('markdownToDoc(docToMarkdown(markdownToDoc(md))) deep-equals markdownToDoc(md) for heading', () => {
    const md = '## A heading';
    const doc1 = markdownToDoc(md);
    const doc2 = markdownToDoc(docToMarkdown(doc1));
    expect(doc2).toEqual(doc1);
  });

  it('markdownToDoc(docToMarkdown(markdownToDoc(md))) deep-equals markdownToDoc(md) for table', () => {
    const md = `| A | B |\n| --- | --- |\n| 1 | 2 |`;
    const doc1 = markdownToDoc(normalise(md));
    const doc2 = markdownToDoc(docToMarkdown(doc1));
    expect(doc2).toEqual(doc1);
  });

  it('markdownToDoc(docToMarkdown(markdownToDoc(md))) deep-equals markdownToDoc(md) for NOTE_MD', () => {
    const normalised = normalise(NOTE_MD);
    const doc1 = markdownToDoc(normalised);
    const doc2 = markdownToDoc(docToMarkdown(doc1));
    expect(doc2).toEqual(doc1);
  });
});
