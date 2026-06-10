/**
 * Custom TipTap Mark for ==highlight== syntax (renders as <mark>).
 *
 * - Input/paste rule: ==text== → highlight mark
 * - parseHTML: <mark> elements
 * - renderHTML: <mark style="background: var(--highlighter)">
 */

import { Mark, markInputRule, markPasteRule } from '@tiptap/core';

/** Regex matching ==...== for input and paste rules. */
const HIGHLIGHT_INPUT_REGEX = /(?:^|[^=])==([^=]+)==(?:[^=]|$)/;
const HIGHLIGHT_PASTE_REGEX = /==([^=]+)==/g;

export const Highlight = Mark.create({
  name: 'highlight',

  parseHTML() {
    return [{ tag: 'mark' }];
  },

  renderHTML() {
    return ['mark', { style: 'background: var(--highlighter)' }, 0] as const;
  },

  addInputRules() {
    return [
      markInputRule({
        find: HIGHLIGHT_INPUT_REGEX,
        type: this.type,
      }),
    ];
  },

  addPasteRules() {
    return [
      markPasteRule({
        find: HIGHLIGHT_PASTE_REGEX,
        type: this.type,
      }),
    ];
  },
});
