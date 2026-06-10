/**
 * low-confidence.ts
 *
 * TipTap inline Node for [?] tokens, plus helpers to split/collapse them
 * in a JSONContent document so round-trips through the serializer stay clean.
 */

import { Node } from '@tiptap/core';
import type { JSONContent } from '@tiptap/core';

// ─── TipTap node definition ───────────────────────────────────────────────────

export const lowConfidence = Node.create({
  name: 'lowConfidence',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      text: {
        default: '[?]',
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span.tmn-low-confidence' }];
  },

  renderHTML() {
    return ['span', { class: 'tmn-low-confidence' }, '[?]'] as const;
  },

  renderText() {
    return '[?]';
  },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const LOW_CONF_TOKEN = '[?]';

/**
 * Deep-clone a JSONContent node.
 */
function cloneNode(node: JSONContent): JSONContent {
  return JSON.parse(JSON.stringify(node)) as JSONContent;
}

/**
 * Split a text node whose `.text` contains one or more `[?]` tokens into an
 * array of nodes — plain text nodes for the surrounding text segments and
 * `{ type: 'lowConfidence' }` nodes for each token.  Marks from the original
 * text node are preserved on the text segments.
 */
function splitTextNode(node: JSONContent): JSONContent[] {
  const raw = node.text ?? '';
  if (!raw.includes(LOW_CONF_TOKEN)) return [cloneNode(node)];

  const parts = raw.split(LOW_CONF_TOKEN);
  const result: JSONContent[] = [];

  for (let i = 0; i < parts.length; i++) {
    if (parts[i] !== '') {
      const textNode: JSONContent = { type: 'text', text: parts[i] };
      if (node.marks && node.marks.length > 0) {
        textNode.marks = node.marks.map((m) => ({ ...m }));
      }
      result.push(textNode);
    }
    // After all but the last segment, insert a lowConfidence node.
    if (i < parts.length - 1) {
      result.push({ type: 'lowConfidence' });
    }
  }

  return result;
}

/**
 * Walk a JSONContent tree and expand every text node that contains `[?]`
 * into alternating text / lowConfidence nodes.
 *
 * Run this AFTER `markdownToDoc` so the loaded document shows amber-underlined
 * [?] tokens instead of raw literal strings.
 */
export function splitLowConfidence(doc: JSONContent): JSONContent {
  function walk(node: JSONContent): JSONContent {
    if (node.type === 'text') {
      // Leaf text nodes are handled at the parent level; return as-is here.
      return cloneNode(node);
    }

    if (!node.content || node.content.length === 0) {
      return cloneNode(node);
    }

    const newContent: JSONContent[] = [];
    for (const child of node.content) {
      if (child.type === 'text' && child.text && child.text.includes(LOW_CONF_TOKEN)) {
        newContent.push(...splitTextNode(child));
      } else {
        newContent.push(walk(child));
      }
    }

    return { ...cloneNode(node), content: newContent };
  }

  return walk(doc);
}

/**
 * Walk a JSONContent tree and replace every `lowConfidence` node with a plain
 * `{ type: 'text', text: '[?]' }` node so the result is safe to pass to
 * `docToMarkdown` (which does not know the `lowConfidence` type).
 *
 * Run this BEFORE `docToMarkdown`.
 */
export function collapseLowConfidence(doc: JSONContent): JSONContent {
  function walk(node: JSONContent): JSONContent {
    if (node.type === 'lowConfidence') {
      return { type: 'text', text: '[?]' };
    }

    if (!node.content || node.content.length === 0) {
      return cloneNode(node);
    }

    return {
      ...cloneNode(node),
      content: node.content.map(walk),
    };
  }

  return walk(doc);
}
