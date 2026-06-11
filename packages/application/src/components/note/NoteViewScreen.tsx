'use client';

import React, { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import NoteEditor from '@/src/components/editor/NoteEditor';
import type { NoteEditorHandle } from '@/src/components/editor/NoteEditor';
import { ActionBar } from '@/src/components/review/ActionBar';
import {
  Badge,
  Button,
  Icon,
  IconButton,
  SegmentedControl,
  Tag,
  Toast,
} from '@/src/components/ui';
import { ShareSheet } from './ShareSheet';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NoteViewScreenProps {
  noteId: string;
  title: string;
  initialMarkdown: string;
  tags: string[];
  words: number;
  langPair: string;
  ocrConfidence: number;
  originalImageUrl: string | null;
  isOwner: boolean;
  groupId?: string;
  ownerSub: string;
}

type ViewTab = 'original' | 'clean';

interface ToastState {
  tone: 'success' | 'danger' | 'neutral' | 'warning';
  title: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function NoteViewScreen({
  noteId,
  title,
  initialMarkdown,
  tags,
  words,
  langPair,
  ocrConfidence,
  originalImageUrl,
  isOwner,
  groupId,
}: NoteViewScreenProps) {
  const router = useRouter();
  const editorRef = useRef<NoteEditorHandle>(null);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<ViewTab>('clean');
  const [toast, setToast] = useState<ToastState | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [cardSyncing, setCardSyncing] = useState(false);

  // ── Save handler ──────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const markdown = editorRef.current?.getMarkdown() ?? initialMarkdown;

      const res = await fetch('/api/notes/' + noteId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markdown, title, tags }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      setEditing(false);
      setToast({ tone: 'success', title: 'Note saved' });
    } catch {
      setToast({ tone: 'danger', title: "Couldn't save — try again" });
    } finally {
      setSaving(false);
    }
  }, [noteId, initialMarkdown, title, tags]);

  // ── Toggle edit / done ────────────────────────────────────────────────────

  const handleEditToggle = useCallback(() => {
    if (editing) {
      void handleSave();
    } else {
      setEditing(true);
      // Focus editor after it becomes editable
      setTimeout(() => editorRef.current?.focus(), 0);
    }
  }, [editing, handleSave]);

  // ── Add to review deck ────────────────────────────────────────────────────

  const handleAddToReviewDeck = useCallback(async () => {
    setCardSyncing(true);
    try {
      const res = await fetch(`/api/notes/${noteId}/cards/refresh`, {
        method: 'POST',
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = (await res.json()) as {
        created: number;
        deleted: number;
        unchanged: number;
      };

      if (data.created === 0 && data.unchanged === 0) {
        setToast({
          tone: 'neutral',
          title: 'Add == highlight == marks to your note to create review cards.',
        });
      } else if (data.created > 0) {
        setToast({
          tone: 'success',
          title: `Added ${data.created} ${data.created === 1 ? 'card' : 'cards'} to review`,
        });
      } else {
        setToast({ tone: 'success', title: 'Added to review' });
      }
    } catch {
      setToast({
        tone: 'danger',
        title: "Couldn't update review deck — try again",
      });
    } finally {
      setCardSyncing(false);
    }
  }, [noteId]);

  // ── Render ────────────────────────────────────────────────────────────────

  const firstTag = tags[0];

  return (
    <div className="tmn-note-screen">
      {/* ── Header ── */}
      <div className="tmn-note-header">
        <IconButton
          label="Back"
          variant="plain"
          onClick={() => router.push('/dashboard')}
        >
          <Icon name="chevron-left" size={24} />
        </IconButton>

        {/* Badge showing first tag / course */}
        {firstTag && (
          <Badge tone="brand" className="tmn-note-header-badge">
            {firstTag}
          </Badge>
        )}

        {/* Edit / Done toggle — owner only */}
        {isOwner && (
          editing ? (
            <IconButton
              label="Done"
              variant="soft"
              onClick={handleEditToggle}
              disabled={saving}
            >
              <Icon name="check" size={20} />
            </IconButton>
          ) : (
            <IconButton
              label="Edit"
              variant="plain"
              onClick={handleEditToggle}
            >
              <Icon name="pencil" size={20} />
            </IconButton>
          )
        )}
      </div>

      {/* ── Scrollable body ── */}
      <div className="tmn-note-body">
        {/* Title */}
        <h1 className="tmn-note-title">{title}</h1>

        {/* Metadata row */}
        <div className="tmn-note-meta">
          <span>{langPair}</span>
          <span className="tmn-note-meta-dot">·</span>
          <span>{words.toLocaleString()} words</span>
          <span className="tmn-note-meta-dot">·</span>
          <span>OCR {ocrConfidence}%</span>
        </div>

        {/* Segmented control — only when NOT editing */}
        {!editing && (
          <div className="tmn-note-seg-header">
            <SegmentedControl
              value={view}
              onChange={(v) => setView(v as ViewTab)}
              ariaLabel="View mode"
              options={[
                { value: 'original', label: 'Original' },
                { value: 'clean', label: 'Clean' },
              ]}
            />
          </div>
        )}

        {/* Original image — show when viewing 'original' and not editing */}
        {!editing && view === 'original' && (
          <div className="tmn-note-image-section">
            {originalImageUrl ? (
              <div className="tmn-review-image-frame">
                <img src={originalImageUrl} alt="Original handwriting" />
              </div>
            ) : (
              <div className="tmn-review-image-placeholder">
                <Icon name="image-off" size={36} />
              </div>
            )}
          </div>
        )}

        {/* NoteEditor — always mounted; show when clean view or editing */}
        {(editing || view === 'clean') && (
          <div className="tmn-note-editor-section">
            <NoteEditor
              ref={editorRef}
              initialMarkdown={initialMarkdown}
              editable={isOwner && editing}
            />
          </div>
        )}

        {/* Tags — only when NOT editing */}
        {!editing && tags.length > 0 && (
          <div className="tmn-note-tags">
            {tags.map((tag) => (
              <Tag key={tag} tone="brand" hash>
                {tag}
              </Tag>
            ))}
          </div>
        )}
      </div>

      {/* ── ActionBar — only when NOT editing ── */}
      {!editing && (
        <ActionBar>
          {/* Share button — owner only */}
          {isOwner && (
            <IconButton
              label="Share"
              variant="soft"
              onClick={() => setShareOpen(true)}
            >
              <Icon name="share-2" size={19} />
            </IconButton>
          )}

          {/* Highlight — owner only (mutates the editor) */}
          {isOwner && (
            <IconButton
              label="Highlight"
              variant="soft"
              onClick={() => editorRef.current?.toggleHighlight()}
            >
              <Icon name="highlighter" size={19} />
            </IconButton>
          )}

          <IconButton
            label="Translate"
            variant="soft"
            disabled
            title="Coming soon"
          >
            <Icon name="languages" size={19} />
          </IconButton>

          {isOwner && (
            <Button
              variant="secondary"
              fullWidth
              leftIcon={<Icon name="layers" size={18} />}
              loading={cardSyncing}
              onClick={() => void handleAddToReviewDeck()}
            >
              Add to review deck
            </Button>
          )}
        </ActionBar>
      )}

      {/* ── Share Sheet — owner only ── */}
      {isOwner && (
        <ShareSheet
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          noteId={noteId}
          noteTitle={title}
          groupId={groupId}
        />
      )}

      {/* ── Toast ── */}
      {toast && (
        <div className="tmn-review-toast-container">
          <Toast
            tone={toast.tone}
            icon={
              toast.tone === 'success' ? (
                <Icon name="check" size={16} />
              ) : undefined
            }
            title={toast.title}
            onClose={() => setToast(null)}
            duration={3200}
          />
        </div>
      )}
    </div>
  );
}

NoteViewScreen.displayName = 'NoteViewScreen';
