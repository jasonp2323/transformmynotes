'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import NoteEditor from '@/src/components/editor/NoteEditor';
import type { NoteEditorHandle } from '@/src/components/editor/NoteEditor';
import { FloatingActionMenu } from '@/src/components/note/FloatingActionMenu';
import { ImageLightbox } from '@/src/components/review/ImageLightbox';
import {
  Badge,
  Button,
  Icon,
  IconButton,
  SegmentedControl,
  Tag,
  Toast,
} from '@/src/components/ui';
import { getCurrentUserSub, cacheNote, enqueueMutation } from '@/src/lib/offline';
import type { NoteMetadata } from '@/src/lib/library';
import { ShareSheet } from './ShareSheet';
import { GenerateStudyMaterial } from './GenerateStudyMaterial';
import { StudySetsForNote } from './StudySetsForNote';
import { NoteSetPicker } from '@/src/components/study/NoteSetPicker';
import { CardForm } from '@/src/components/cards/CardForm';

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
  updatedAt: string;
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
  updatedAt,
}: NoteViewScreenProps) {
  const router = useRouter();
  const editorRef = useRef<NoteEditorHandle>(null);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<ViewTab>('clean');
  const [toast, setToast] = useState<ToastState | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [cardSyncing, setCardSyncing] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [studyRefreshNonce, setStudyRefreshNonce] = useState(0);
  const [multiPickerOpen, setMultiPickerOpen] = useState(false);
  const [addCardOpen, setAddCardOpen] = useState(false);
  const [savingCard, setSavingCard] = useState(false);

  // Derive whether the note body contains any == highlight == marks.
  // Using initialMarkdown is acceptable per spec — the note body is already loaded on the client.
  const hasHighlights = useMemo(
    () => /==[^=\n]+==/.test(initialMarkdown),
    [initialMarkdown],
  );

  // Initialize to true (online) to avoid SSR/hydration mismatch; corrected on mount.
  const [isOnline, setIsOnline] = useState(true);

  const [baseUpdatedAt, setBaseUpdatedAt] = useState(updatedAt);

  interface ConflictState {
    server: {
      updatedAt: string;
      title: string;
      tags: string[];
      markdown: string;
      words: number;
      highlights: number;
      langPair: string;
      ocrConfidence: number;
    };
  }
  const [conflict, setConflict] = useState<ConflictState | null>(null);

  // ── Online/offline detection ───────────────────────────────────────────────
  useEffect(() => {
    setIsOnline(navigator.onLine);

    function handleOnline() { setIsOnline(true); }
    function handleOffline() { setIsOnline(false); }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // ── Persist note to IndexedDB read store on mount ─────────────────────────
  // Runs once per noteId. Authoritative metadata lives in the library list
  // cache (LibraryNotes); this snapshot exists so the note BODY is available
  // offline and to seed future offline editing (M22.3).
  useEffect(() => {
    getCurrentUserSub()
      .then((sub) => {
        if (!sub) return;
        const snapshot: NoteMetadata = {
          noteId,
          title,
          tags,
          words,
          langPair,
          ocrConfidence,
          status: 'clean',   // safe default — authoritative value is in the list cache
          highlights: 0,     // safe default
          createdAt: '',     // safe default
          updatedAt: baseUpdatedAt,
          groupId,
        };
        return cacheNote(sub, noteId, snapshot, initialMarkdown);
      })
      .catch(() => {});
    // Deps are stable for the lifetime of a single note view; re-cache if noteId changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  // ── Save handler ──────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const markdown = editorRef.current?.getMarkdown() ?? initialMarkdown;

      // ── Offline path ──────────────────────────────────────────────────────
      if (!navigator.onLine) {
        const sub = await getCurrentUserSub();
        if (!sub) {
          setToast({ tone: 'danger', title: "Couldn't save — try again" });
          return;
        }
        try {
          await enqueueMutation({ sub, noteId, payload: { markdown, title, tags, baseUpdatedAt } });
          // Refresh offline read-store with the user's pending edit
          await cacheNote(sub, noteId, {
            noteId, title, tags, words, langPair, ocrConfidence,
            status: 'clean', highlights: 0, createdAt: '', updatedAt: baseUpdatedAt, groupId,
          }, markdown);
          setEditing(false);
          setToast({ tone: 'neutral', title: "Saved offline — will sync when you're back online." });
          // Best-effort Background Sync registration
          navigator.serviceWorker?.ready
            .then((r) => (r.sync as { register?: (tag: string) => Promise<void> } | undefined)?.register?.('tmn-sync'))
            .catch(() => {});
        } catch {
          setToast({ tone: 'danger', title: "Couldn't save — try again" });
        }
        return;
      }

      // ── Online path ───────────────────────────────────────────────────────
      let res: Response;
      try {
        res = await fetch('/api/notes/' + noteId, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ markdown, title, tags, baseUpdatedAt }),
        });
      } catch {
        // Network error — treat as offline
        const sub = await getCurrentUserSub();
        if (!sub) {
          setToast({ tone: 'danger', title: "Couldn't save — try again" });
          return;
        }
        try {
          await enqueueMutation({ sub, noteId, payload: { markdown, title, tags, baseUpdatedAt } });
          await cacheNote(sub, noteId, {
            noteId, title, tags, words, langPair, ocrConfidence,
            status: 'clean', highlights: 0, createdAt: '', updatedAt: baseUpdatedAt, groupId,
          }, markdown);
          setEditing(false);
          setToast({ tone: 'neutral', title: "Saved offline — will sync when you're back online." });
          navigator.serviceWorker?.ready
            .then((r) => (r.sync as { register?: (tag: string) => Promise<void> } | undefined)?.register?.('tmn-sync'))
            .catch(() => {});
        } catch {
          setToast({ tone: 'danger', title: "Couldn't save — try again" });
        }
        return;
      }

      if (res.ok) {
        const data = (await res.json()) as { updatedAt: string };
        setBaseUpdatedAt(data.updatedAt);
        setEditing(false);
        setToast({ tone: 'success', title: 'Note saved' });
        // Refresh offline read-store with the authoritative copy
        const sub = await getCurrentUserSub();
        if (sub) {
          await cacheNote(sub, noteId, {
            noteId, title, tags, words, langPair, ocrConfidence,
            status: 'clean', highlights: 0, createdAt: '', updatedAt: data.updatedAt, groupId,
          }, markdown).catch(() => {});
        }
        return;
      }

      if (res.status === 409) {
        const body = (await res.json()) as {
          conflict: true;
          server: ConflictState['server'];
        };
        setConflict({ server: body.server });
        return;
      }

      // Other errors (400/401/404/500)
      setToast({ tone: 'danger', title: "Couldn't save — try again" });
    } catch {
      setToast({ tone: 'danger', title: "Couldn't save — try again" });
    } finally {
      setSaving(false);
    }
  }, [noteId, initialMarkdown, title, tags, baseUpdatedAt, words, langPair, ocrConfidence, groupId]);

  // ── Conflict resolution handlers ──────────────────────────────────────────

  const handleKeepMine = useCallback(async () => {
    if (!conflict) return;
    setSaving(true);
    try {
      const markdown = editorRef.current?.getMarkdown() ?? initialMarkdown;
      const res = await fetch('/api/notes/' + noteId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markdown, title, tags, baseUpdatedAt: conflict.server.updatedAt }),
      });
      if (res.ok) {
        const data = (await res.json()) as { updatedAt: string };
        setBaseUpdatedAt(data.updatedAt);
        setConflict(null);
        setEditing(false);
        setToast({ tone: 'success', title: 'Note saved' });
      } else {
        setToast({ tone: 'danger', title: "Couldn't save — try again" });
      }
    } catch {
      setToast({ tone: 'danger', title: "Couldn't save — try again" });
    } finally {
      setSaving(false);
    }
  }, [conflict, noteId, initialMarkdown, title, tags]);

  const handleUseServer = useCallback(() => {
    if (!conflict) return;
    // Replace editor content with server's version
    editorRef.current?.setMarkdown(conflict.server.markdown);
    setBaseUpdatedAt(conflict.server.updatedAt);
    setConflict(null);
    setEditing(false);
    router.refresh();
  }, [conflict, router]);

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

  // ── Manual card creation ──────────────────────────────────────────────────

  const handleCreateManualCard = useCallback(async (values: { front: string; back: string }) => {
    setSavingCard(true);
    try {
      const res = await fetch('/api/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ front: values.front, back: values.back, sourceNoteId: noteId }),
      });
      if (res.ok) {
        setAddCardOpen(false);
        setToast({ tone: 'success', title: 'Card added' });
      } else {
        const err = new Error(`HTTP ${res.status}`);
        setToast({ tone: 'danger', title: "Couldn't add card — try again" });
        throw err;
      }
    } catch (err) {
      // Only set danger toast for network/unexpected errors (non-ok path already set it)
      if (!(err instanceof Error && err.message.startsWith('HTTP '))) {
        setToast({ tone: 'danger', title: "Couldn't add card — try again" });
      }
      throw err;
    } finally {
      setSavingCard(false);
    }
  }, [noteId]);

  // ── Render ────────────────────────────────────────────────────────────────

  const firstTag = tags[0];

  return (
    <div className="tmn-note-screen">
      {/* ── Offline indicator ── */}
      {!isOnline && (
        <div
          role="status"
          style={{
            margin: '0 0 0',
            padding: '10px 14px',
            background: 'var(--warning-50)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <Icon name="cloud-off" size={18} color="var(--warning-500)" />
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 13,
              color: 'var(--stone-700)',
              lineHeight: 1.4,
            }}
          >
            You&rsquo;re offline — showing your saved copy.
          </span>
        </div>
      )}

      {/* ── Conflict resolution banner ── */}
      {conflict && (
        <div
          role="alertdialog"
          aria-modal="false"
          aria-label="Edit conflict"
          style={{
            margin: '0',
            padding: '14px 16px',
            background: 'var(--warning-50)',
            borderBottom: '1px solid var(--warning-200)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="alert-triangle" size={18} color="var(--warning-500)" />
            <span
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--stone-900)',
              }}
            >
              Edit conflict
            </span>
          </div>
          <p
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 13,
              color: 'var(--stone-700)',
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            Someone else updated this note while you were editing. Choose which version to keep.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button
              variant="primary"
              onClick={() => void handleKeepMine()}
              disabled={saving}
            >
              Keep my version
            </Button>
            <Button
              variant="secondary"
              onClick={handleUseServer}
              disabled={saving}
            >
              Use server&apos;s version
            </Button>
          </div>
        </div>
      )}

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
              <>
                <div className="tmn-review-image-frame">
                  <button
                    className="tmn-review-image-btn"
                    aria-label="View full image"
                    onClick={() => setLightboxOpen(true)}
                  >
                    <img src={originalImageUrl} alt="Original handwriting" />
                  </button>
                </div>
                <ImageLightbox
                  src={originalImageUrl}
                  alt="Original handwriting — full size"
                  open={lightboxOpen}
                  onClose={() => setLightboxOpen(false)}
                />
              </>
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

      {/* ── FloatingActionMenu — only when NOT editing ── */}
      {!editing && (
        <FloatingActionMenu>
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
            <>
              {!hasHighlights && (
                <p
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: 12,
                    color: 'var(--text-subtle)',
                    margin: '0 0 4px',
                    lineHeight: 1.4,
                  }}
                >
                  Highlight text in your note, then generate cards from it.
                </p>
              )}
              <Button
                variant="secondary"
                fullWidth
                leftIcon={<Icon name="highlighter" size={18} />}
                loading={cardSyncing}
                onClick={() => void handleAddToReviewDeck()}
              >
                Generate from highlights
              </Button>
            </>
          )}

          {isOwner && (
            <Button
              variant="secondary"
              fullWidth
              leftIcon={<Icon name="plus" size={18} />}
              onClick={() => setAddCardOpen(true)}
            >
              + Add card
            </Button>
          )}

          {isOwner && (
            <Button
              variant="secondary"
              fullWidth
              leftIcon={<Icon name="sparkles" size={18} />}
              onClick={() => router.push(`/notes/${noteId}/generate-cards`)}
            >
              AI flashcards
            </Button>
          )}

          {isOwner && (
            <Button
              variant="secondary"
              fullWidth
              leftIcon={<Icon name="sparkles" size={18} />}
              onClick={() => setMultiPickerOpen(true)}
            >
              Multi-note generate
            </Button>
          )}

          {isOwner && (
            <GenerateStudyMaterial
              noteId={noteId}
              onStudySetReady={() => setStudyRefreshNonce((n) => n + 1)}
            />
          )}
        </FloatingActionMenu>
      )}

      {isOwner && (
        <NoteSetPicker
          open={multiPickerOpen}
          onClose={() => setMultiPickerOpen(false)}
          initialSelectedIds={[noteId]}
        />
      )}

      {/* ── Manual card creation dialog — owner only ── */}
      {isOwner && (
        <CardForm
          open={addCardOpen}
          title="Add card"
          saving={savingCard}
          onClose={() => setAddCardOpen(false)}
          onSave={handleCreateManualCard}
        />
      )}

      {/* ── Study sets for this note — owner only ── */}
      {isOwner && (
        <StudySetsForNote noteId={noteId} refreshNonce={studyRefreshNonce} />
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
      )}
    </div>
  );
}

NoteViewScreen.displayName = 'NoteViewScreen';
