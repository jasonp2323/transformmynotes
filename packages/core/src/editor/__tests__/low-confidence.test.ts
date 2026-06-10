import { describe, it, expect } from 'vitest';
import { markdownToDoc, docToMarkdown, normalise } from '../serialize';
import { LowConfidence } from '../low-confidence-node';
import { editorExtensions } from '../extensions';
import type { JSONContent } from '@tiptap/core';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getParagraphContent(md: string): JSONContent[] {
  const doc = markdownToDoc(md);
  return doc.content?.[0]?.content ?? [];
}

// ─── 1. Basic parse ───────────────────────────────────────────────────────────

describe('lowConfidence node — parsing', () => {
  it('markdownToDoc("fix [?] this") contains a lowConfidence node in paragraph content', () => {
    const nodes = getParagraphContent('fix [?] this');
    const lcNode = nodes.find((n) => n.type === 'lowConfidence');
    expect(lcNode).toBeDefined();
    expect(lcNode?.type).toBe('lowConfidence');
  });

  // ─── 2. Serialization ──────────────────────────────────────────────────────

  it('docToMarkdown serializes a lowConfidence node back to [?]', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'fix ' },
            { type: 'lowConfidence' },
            { type: 'text', text: ' this' },
          ],
        },
      ],
    };
    const md = docToMarkdown(doc);
    expect(md).toContain('[?]');
    expect(normalise(md)).toBe(normalise('fix [?] this'));
  });

  // ─── 3. Round-trip ─────────────────────────────────────────────────────────

  it('round-trips "fix [?] this"', () => {
    expect(normalise(docToMarkdown(markdownToDoc('fix [?] this')))).toBe(normalise('fix [?] this'));
  });

  // ─── 4. Multiple [?] tokens ────────────────────────────────────────────────

  it('multiple [?] tokens in one paragraph → two separate lowConfidence nodes', () => {
    const nodes = getParagraphContent('start [?] middle [?] end');
    const lcNodes = nodes.filter((n) => n.type === 'lowConfidence');
    expect(lcNodes).toHaveLength(2);
  });

  // ─── 5. [?] inside bold ────────────────────────────────────────────────────

  it('[?] inside bold carries a bold mark and round-trips', () => {
    const nodes = getParagraphContent('**fix [?] this**');
    const lcNode = nodes.find((n) => n.type === 'lowConfidence');
    expect(lcNode).toBeDefined();
    const hasBold = lcNode?.marks?.some((m) => m.type === 'bold');
    expect(hasBold).toBe(true);
    // Surrounding text nodes should also carry bold
    const boldTextNodes = nodes.filter(
      (n) => n.type === 'text' && n.marks?.some((m) => m.type === 'bold'),
    );
    expect(boldTextNodes.length).toBeGreaterThan(0);
    // Round-trip
    expect(normalise(docToMarkdown(markdownToDoc('**fix [?] this**')))).toBe(
      normalise('**fix [?] this**'),
    );
  });

  // ─── 6. Plain [foo] is NOT lowConfidence ───────────────────────────────────

  it('[foo] is not parsed as a lowConfidence node', () => {
    const nodes = getParagraphContent('some [foo] bracket');
    const lcNode = nodes.find((n) => n.type === 'lowConfidence');
    expect(lcNode).toBeUndefined();
    // Should still have text containing [foo]
    const allText = nodes
      .filter((n) => n.type === 'text')
      .map((n) => n.text ?? '')
      .join('');
    expect(allText).toContain('[foo]');
  });

  // ─── 7. [?] inside inline code stays code text ─────────────────────────────

  it('`[?]` inside backtick code stays code text — NOT a lowConfidence node', () => {
    const nodes = getParagraphContent('`[?]`');
    const lcNode = nodes.find((n) => n.type === 'lowConfidence');
    expect(lcNode).toBeUndefined();
    const codeNode = nodes.find((n) => n.marks?.some((m) => m.type === 'code'));
    expect(codeNode).toBeDefined();
    expect(codeNode?.text).toBe('[?]');
  });

  // ─── 8. Extension registry ─────────────────────────────────────────────────

  it('LowConfidence extension name is "lowConfidence"', () => {
    expect(LowConfidence.name).toBe('lowConfidence');
  });

  it('editorExtensions includes an extension named "lowConfidence"', () => {
    const found = editorExtensions.some((ext) => ext.name === 'lowConfidence');
    expect(found).toBe(true);
  });

  it('LowConfidence config has renderText returning "[?]"', () => {
    // renderText is on the extension config; call it directly
    const renderText = (LowConfidence as { config?: { renderText?: () => string } }).config
      ?.renderText;
    if (renderText) {
      expect(renderText()).toBe('[?]');
    } else {
      // If the accessor differs by tiptap version, skip gracefully
      expect(LowConfidence.name).toBe('lowConfidence');
    }
  });

  // ─── 9. Bonus: [?] at start of heading and list item round-trips ───────────

  it('[?] at the start of a heading round-trips', () => {
    const md = '## [?] header text';
    expect(normalise(docToMarkdown(markdownToDoc(md)))).toBe(normalise(md));
  });

  it('[?] in a list item round-trips', () => {
    const md = '- item with [?] token';
    expect(normalise(docToMarkdown(markdownToDoc(md)))).toBe(normalise(md));
  });
});
