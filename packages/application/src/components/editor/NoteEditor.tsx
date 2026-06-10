'use client';

/**
 * NoteEditor.tsx
 *
 * Rich block editor component built on TipTap v3.
 * Public API is exposed via forwardRef (NoteEditorHandle).
 *
 * Phase B wires navigation and the review screen — do not change the
 * NoteEditorHandle / NoteEditorProps signatures without coordinating with
 * Phase B.
 */

import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { Placeholder } from '@tiptap/extension-placeholder';
import { markdownToDoc, docToMarkdown } from '@transformmynotes/core/editor/serialize';
import { editorExtensions } from '@transformmynotes/core/editor/extensions';
import { lowConfidence, splitLowConfidence, collapseLowConfidence } from './low-confidence';
import { useSlashExtension } from './slash-command';
import { Icon, IconButton, Textarea } from '@/src/components/ui';
import { cn } from '@/src/lib/cn';

// ─── Public API ────────────────────────────────────────────────────────────────

export interface NoteEditorHandle {
  /** Current content as canonical markdown — [?] tokens preserved. */
  getMarkdown(): string;
  /** Replace the current content. */
  setMarkdown(md: string): void;
  /** Focus the editor. */
  focus(): void;
  /** Toggle the highlight mark on the current selection. */
  toggleHighlight(): void;
}

export interface NoteEditorProps {
  initialMarkdown: string;
  /** Default true — pass false for read-only NoteView. */
  editable?: boolean;
  /** Fires on every doc update. */
  onChange?: () => void;
  className?: string;
}

// ─── Low-confidence popover (tap-to-replace) ─────────────────────────────────

interface LowConfPopover {
  visible: boolean;
  top: number;
  left: number;
  pos: number; // ProseMirror node position
}

const HIDDEN_POPOVER: LowConfPopover = { visible: false, top: 0, left: 0, pos: -1 };

// ─── Component ────────────────────────────────────────────────────────────────

const NoteEditor = forwardRef<NoteEditorHandle, NoteEditorProps>(function NoteEditor(
  { initialMarkdown, editable = true, onChange, className },
  ref,
) {
  // ── Mode: rich editor vs raw markdown textarea ───────────────────────────
  const [rawMode, setRawMode] = useState(false);
  const rawRef = useRef<HTMLTextAreaElement>(null);
  const [rawValue, setRawValue] = useState('');

  // ── Slash menu ───────────────────────────────────────────────────────────
  const { extension: slashExtension, SlashMenuPortal } = useSlashExtension();

  // ── Low-confidence [?] popover ───────────────────────────────────────────
  const [popover, setPopover] = useState<LowConfPopover>(HIDDEN_POPOVER);
  const [popoverInput, setPopoverInput] = useState('');
  const popoverInputRef = useRef<HTMLInputElement>(null);

  // ── TipTap editor ────────────────────────────────────────────────────────
  const editor = useEditor(
    {
      immediatelyRender: false,
      editable,
      extensions: [
        ...editorExtensions,
        Placeholder.configure({ placeholder: 'Start writing…' }),
        lowConfidence,
        slashExtension,
      ],
      editorProps: {
        attributes: {
          class: 'tmn-editor-content',
          style: 'touch-action: pan-y;',
        },
        handleClickOn(view, pos, node) {
          if (node.type.name === 'lowConfidence') {
            const coords = view.coordsAtPos(pos);
            setPopoverInput('');
            setPopover({
              visible: true,
              top: coords.bottom + window.scrollY + 4,
              left: coords.left + window.scrollX,
              pos,
            });
            return true;
          }
          return false;
        },
      },
      onUpdate() {
        onChange?.();
      },
      content: splitLowConfidence(markdownToDoc(initialMarkdown)),
    },
  );

  // Focus popover input when it opens
  useEffect(() => {
    if (popover.visible) {
      setTimeout(() => popoverInputRef.current?.focus(), 0);
    }
  }, [popover.visible]);

  // ── Imperative handle ────────────────────────────────────────────────────
  useImperativeHandle(
    ref,
    () => ({
      getMarkdown() {
        if (rawMode) {
          return rawRef.current?.value ?? rawValue;
        }
        if (!editor) return '';
        return docToMarkdown(collapseLowConfidence(editor.getJSON()));
      },
      setMarkdown(md: string) {
        if (rawMode) {
          setRawValue(md);
        }
        if (!editor) return;
        editor.commands.setContent(splitLowConfidence(markdownToDoc(md)));
      },
      focus() {
        if (rawMode) {
          rawRef.current?.focus();
        } else {
          editor?.commands.focus();
        }
      },
      toggleHighlight() {
        editor?.chain().focus().toggleMark('highlight').run();
      },
    }),
    [editor, rawMode, rawValue],
  );

  // ── Mode switching ────────────────────────────────────────────────────────
  const handleToggleMode = useCallback(() => {
    if (!editor) return;

    if (!rawMode) {
      // Switching to raw: snapshot current doc as markdown
      const md = docToMarkdown(collapseLowConfidence(editor.getJSON()));
      setRawValue(md);
      setRawMode(true);
    } else {
      // Switching back to rich: parse textarea back into editor
      const md = rawRef.current?.value ?? rawValue;
      editor.commands.setContent(splitLowConfidence(markdownToDoc(md)));
      setRawMode(false);
    }
  }, [editor, rawMode, rawValue]);

  const handleRawChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setRawValue(e.target.value);
    onChange?.();
  }, [onChange]);

  // ── Low-confidence popover handlers ──────────────────────────────────────
  const handlePopoverConfirm = useCallback(() => {
    if (!editor || !popover.visible) return;
    const text = popoverInput.trim();
    if (text) {
      const { pos } = popover;
      editor
        .chain()
        .focus()
        .command(({ tr }) => {
          const node = tr.doc.nodeAt(pos);
          if (!node || node.type.name !== 'lowConfidence') return false;
          tr.replaceWith(pos, pos + node.nodeSize, editor.schema.text(text));
          return true;
        })
        .run();
    }
    setPopover(HIDDEN_POPOVER);
  }, [editor, popover, popoverInput]);

  const handlePopoverKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handlePopoverConfirm();
      } else if (e.key === 'Escape') {
        setPopover(HIDDEN_POPOVER);
        editor?.commands.focus();
      }
    },
    [handlePopoverConfirm, editor],
  );

  // Dismiss popover on outside click
  useEffect(() => {
    if (!popover.visible) return;
    function handleOutside(e: MouseEvent) {
      const target = e.target as Node;
      const popoverEl = document.querySelector('.tmn-low-conf-popover');
      if (popoverEl && !popoverEl.contains(target)) {
        setPopover(HIDDEN_POPOVER);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [popover.visible]);

  // ── Read-only mode ────────────────────────────────────────────────────────
  if (!editable) {
    return (
      <div className={cn('tmn-editor-wrapper', className)}>
        <EditorContent editor={editor} />
      </div>
    );
  }

  // ── Editable mode ─────────────────────────────────────────────────────────
  return (
    <div className={cn('tmn-editor-wrapper', className)}>
      {/* Header bar */}
      <div className="tmn-editor-header">
        <IconButton
          label="Toggle Markdown"
          variant={rawMode ? 'soft' : 'plain'}
          size="sm"
          onClick={handleToggleMode}
          className={cn(rawMode && 'is-active')}
        >
          <Icon name="code" size={16} />
        </IconButton>
      </div>

      {/* Rich editor / raw textarea cross-fade */}
      <div className="tmn-editor-body">
        <div className={cn('tmn-editor-layer', !rawMode && 'is-visible')}>
          {editor && (
            <BubbleMenu
              editor={editor}
              className="tmn-bubble-menu"
            >
              <button
                type="button"
                aria-label="Bold"
                className={cn('tmn-bubble-btn', editor.isActive('bold') && 'is-active')}
                onClick={() => editor.chain().focus().toggleBold().run()}
                onMouseDown={(e) => e.preventDefault()}
              >
                <Icon name="bold" size={15} />
              </button>
              <button
                type="button"
                aria-label="Italic"
                className={cn('tmn-bubble-btn', editor.isActive('italic') && 'is-active')}
                onClick={() => editor.chain().focus().toggleItalic().run()}
                onMouseDown={(e) => e.preventDefault()}
              >
                <Icon name="italic" size={15} />
              </button>
              <button
                type="button"
                aria-label="Highlight"
                className={cn('tmn-bubble-btn', editor.isActive('highlight') && 'is-active')}
                onClick={() => editor.chain().focus().toggleMark('highlight').run()}
                onMouseDown={(e) => e.preventDefault()}
              >
                <Icon name="highlighter" size={15} />
              </button>
              <button
                type="button"
                aria-label="Code"
                className={cn('tmn-bubble-btn', editor.isActive('code') && 'is-active')}
                onClick={() => editor.chain().focus().toggleCode().run()}
                onMouseDown={(e) => e.preventDefault()}
              >
                <Icon name="code" size={15} />
              </button>
            </BubbleMenu>
          )}
          <EditorContent editor={editor} />
        </div>

        <div className={cn('tmn-editor-layer', rawMode && 'is-visible')}>
          <Textarea
            ref={rawRef}
            value={rawValue}
            onChange={handleRawChange}
            className="tmn-editor-raw"
            aria-label="Markdown source"
            spellCheck={false}
          />
        </div>
      </div>

      {/* Slash menu portal */}
      {SlashMenuPortal}

      {/* Low-confidence [?] tap-to-replace popover */}
      {popover.visible &&
        createPortal(
          <div
            className="tmn-low-conf-popover"
            style={{ top: popover.top, left: popover.left }}
          >
            <input
              ref={popoverInputRef}
              type="text"
              className="tmn-low-conf-input"
              placeholder="Replace [?] with…"
              value={popoverInput}
              onChange={(e) => setPopoverInput(e.target.value)}
              onKeyDown={handlePopoverKeyDown}
            />
            <button
              type="button"
              className="tmn-low-conf-confirm"
              onClick={handlePopoverConfirm}
              onMouseDown={(e) => e.preventDefault()}
            >
              <Icon name="check" size={14} />
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
});

NoteEditor.displayName = 'NoteEditor';

export default NoteEditor;
