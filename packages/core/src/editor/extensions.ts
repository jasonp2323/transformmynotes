/**
 * Shared TipTap extension registry.
 *
 * This is the single source of truth for the extension set used by BOTH the
 * editor component (packages/application) and the serializer's node/mark
 * vocabulary. Import editorExtensions or individual extensions from here.
 *
 * Do NOT import this file from the core barrel (src/index.ts) — it pulls in
 * tiptap at runtime and should not leak into Lambda bundles. Instead, import
 * via the subpath: '@transformmynotes/core/editor/extensions'.
 */

import StarterKit from '@tiptap/starter-kit';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { Highlight } from './highlight-mark';
import { LowConfidence } from './low-confidence-node';

/** StarterKit configured with the headings and marks this app uses. */
export const configuredStarterKit = StarterKit.configure({
  heading: { levels: [2, 3, 4] },
  // Explicitly enable standard marks/nodes (these are on by default but made explicit for clarity)
  bold: {},
  italic: {},
  code: {},
  bulletList: {},
  orderedList: {},
  listItem: {},
  blockquote: {},
  horizontalRule: {},
  paragraph: {},
});

/** Table extension configured for use in the editor. */
export const TableExtension = Table.configure({ resizable: false });
export { TableRow, TableCell, TableHeader };

/** Custom highlight mark for ==text== syntax. */
export { Highlight };

/** Custom inline node for OCR low-confidence [?] tokens. */
export { LowConfidence };

/**
 * The full extension array to pass to the TipTap Editor constructor.
 * Usage: `new Editor({ extensions: editorExtensions, ... })`
 */
export const editorExtensions = [
  configuredStarterKit,
  TableExtension,
  TableRow,
  TableCell,
  TableHeader,
  Highlight,
  LowConfidence,
];
