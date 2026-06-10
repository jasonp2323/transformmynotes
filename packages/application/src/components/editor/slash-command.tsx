'use client';

/**
 * slash-command.tsx
 *
 * TipTap Extension: slash (/) menu for quick block insertion.
 * Uses @tiptap/suggestion for the trigger; renders the menu as a React
 * portal positioned at the caret (no tippy dependency).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Extension } from '@tiptap/core';
import type { Editor, Range } from '@tiptap/core';
import { Suggestion } from '@tiptap/suggestion';
import type { SuggestionOptions, SuggestionProps } from '@tiptap/suggestion';
import { Icon } from '@/src/components/ui';

// ─── Slash menu items ─────────────────────────────────────────────────────────

interface SlashItem {
  label: string;
  icon: string;
  description: string;
  command: (props: { editor: Editor; range: Range }) => void;
}

const SLASH_ITEMS: SlashItem[] = [
  {
    label: 'Heading 2',
    icon: 'heading',
    description: 'Large section heading',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run();
    },
  },
  {
    label: 'Heading 3',
    icon: 'heading',
    description: 'Medium section heading',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run();
    },
  },
  {
    label: 'Bullet list',
    icon: 'list',
    description: 'Unordered list of items',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run();
    },
  },
  {
    label: 'Numbered list',
    icon: 'list-ordered',
    description: 'Ordered list of items',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run();
    },
  },
  {
    label: 'Table',
    icon: 'table',
    description: '2×3 table with header row',
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 2, cols: 3, withHeaderRow: true })
        .run();
    },
  },
  {
    label: 'Divider',
    icon: 'minus',
    description: 'Horizontal separator line',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run();
    },
  },
];

// ─── Menu component ───────────────────────────────────────────────────────────

interface SlashMenuProps {
  items: SlashItem[];
  selectedIndex: number;
  position: { top: number; left: number };
  onSelect: (item: SlashItem) => void;
  onHover: (index: number) => void;
}

function SlashMenu({ items, selectedIndex, position, onSelect, onHover }: SlashMenuProps) {
  return createPortal(
    <div
      className="tmn-slash-menu"
      style={{ top: position.top, left: position.left }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {items.map((item, index) => (
        <button
          key={`${item.label}-${index}`}
          type="button"
          className={`tmn-slash-menu__item${index === selectedIndex ? ' is-selected' : ''}`}
          onMouseEnter={() => onHover(index)}
          onClick={() => onSelect(item)}
        >
          <span className="tmn-slash-menu__icon">
            <Icon name={item.icon} size={16} />
          </span>
          <span className="tmn-slash-menu__text">
            <span className="tmn-slash-menu__label">{item.label}</span>
            <span className="tmn-slash-menu__desc">{item.description}</span>
          </span>
        </button>
      ))}
    </div>,
    document.body,
  );
}

// ─── Renderer — bridges suggestion lifecycle ↔ React state ───────────────────

/**
 * createSlashRenderer returns a suggestion `render` function whose lifecycle
 * methods drive a shared React state object rendered by <SlashMenuPortal>.
 */

interface MenuState {
  visible: boolean;
  items: SlashItem[];
  selectedIndex: number;
  position: { top: number; left: number };
  props: SuggestionProps<SlashItem> | null;
}

const HIDDEN_STATE: MenuState = {
  visible: false,
  items: [],
  selectedIndex: 0,
  position: { top: 0, left: 0 },
  props: null,
};

type SetMenuState = React.Dispatch<React.SetStateAction<MenuState>>;

function makeRenderer(setMenu: SetMenuState): SuggestionOptions<SlashItem>['render'] {
  return () => {
    return {
      onStart(props) {
        const rect = props.clientRect?.();
        if (!rect) return;
        setMenu({
          visible: true,
          items: props.items,
          selectedIndex: 0,
          position: { top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX },
          props,
        });
      },

      onUpdate(props) {
        const rect = props.clientRect?.();
        setMenu((prev) => ({
          ...prev,
          items: props.items,
          position: rect
            ? { top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX }
            : prev.position,
          props,
        }));
      },

      onKeyDown({ event }) {
        if (event.key === 'Escape') {
          setMenu(HIDDEN_STATE);
          return true;
        }

        if (event.key === 'ArrowUp') {
          setMenu((prev) => ({
            ...prev,
            selectedIndex: (prev.selectedIndex - 1 + prev.items.length) % prev.items.length,
          }));
          return true;
        }

        if (event.key === 'ArrowDown') {
          setMenu((prev) => ({
            ...prev,
            selectedIndex: (prev.selectedIndex + 1) % prev.items.length,
          }));
          return true;
        }

        if (event.key === 'Enter') {
          setMenu((prev) => {
            const item = prev.items[prev.selectedIndex];
            if (item && prev.props) {
              prev.props.command({ item });
            }
            return HIDDEN_STATE;
          });
          return true;
        }

        return false;
      },

      onExit() {
        setMenu(HIDDEN_STATE);
      },
    };
  };
}

// ─── Hook: exposes setMenu + renders the portal ───────────────────────────────

export function useSlashMenu(): {
  setMenu: SetMenuState;
  SlashMenuPortal: React.ReactNode;
} {
  const [menu, setMenu] = useState<MenuState>(HIDDEN_STATE);

  const handleSelect = useCallback(
    (item: SlashItem) => {
      if (menu.props) {
        menu.props.command({ item });
      }
      setMenu(HIDDEN_STATE);
    },
    [menu.props],
  );

  const handleHover = useCallback((index: number) => {
    setMenu((prev) => ({ ...prev, selectedIndex: index }));
  }, []);

  const SlashMenuPortal =
    menu.visible && menu.items.length > 0 ? (
      <SlashMenu
        items={menu.items}
        selectedIndex={menu.selectedIndex}
        position={menu.position}
        onSelect={handleSelect}
        onHover={handleHover}
      />
    ) : null;

  return { setMenu, SlashMenuPortal };
}

// ─── Extension factory ─────────────────────────────────────────────────────────

/**
 * Build the slash-command TipTap extension.
 * Call once per editor instance and pass the `setMenu` function from
 * `useSlashMenu()` so the menu React state is driven by the suggestion lifecycle.
 */
export function buildSlashExtension(setMenu: SetMenuState): Extension {
  return Extension.create({
    name: 'slashCommand',

    addProseMirrorPlugins() {
      return [
        Suggestion<SlashItem>({
          editor: this.editor,
          char: '/',
          startOfLine: false,
          allowedPrefixes: null,

          items({ query }: { query: string }) {
            const q = query.toLowerCase();
            if (!q) return SLASH_ITEMS;
            return SLASH_ITEMS.filter(
              (item) =>
                item.label.toLowerCase().includes(q) ||
                item.description.toLowerCase().includes(q),
            );
          },

          command({ editor, range, props }: { editor: Editor; range: Range; props: SlashItem }) {
            props.command({ editor, range });
          },

          render: makeRenderer(setMenu),
        }),
      ];
    },
  });
}

// ─── Re-export SlashMenuRef helper for external use ──────────────────────────

export type { SlashItem };

/**
 * A stable ref-holder for the setMenu function, so an extension created once
 * can still drive the latest React state without being recreated.
 */
export function useSlashExtension(): {
  extension: Extension;
  SlashMenuPortal: React.ReactNode;
} {
  const { setMenu, SlashMenuPortal } = useSlashMenu();
  const setMenuRef = useRef(setMenu);
  setMenuRef.current = setMenu;

  // Build the extension once and expose a stable ref-based setMenu.
  const extensionRef = useRef<Extension | null>(null);
  if (!extensionRef.current) {
    extensionRef.current = buildSlashExtension((...args) => setMenuRef.current(...args));
  }

  return { extension: extensionRef.current, SlashMenuPortal };
}
