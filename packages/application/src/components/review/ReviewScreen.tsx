'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import NoteEditor from '@/src/components/editor/NoteEditor';
import type { NoteEditorHandle } from '@/src/components/editor/NoteEditor';
import { ActionBar } from './ActionBar';
import {
  Badge,
  Button,
  Icon,
  IconButton,
  SegmentedControl,
  Tag,
  Toast,
} from '@/src/components/ui';
import { cn } from '@/src/lib/cn';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ReviewScreenProps {
  jobId: string;
  initialMarkdown: string;
  wordCount: number;
  langPair: string;
  ocrConfidence: number;
  originalImageUrl: string | null;
  forceLayout?: 'stacked' | 'segmented';
}

type Layout = 'stacked' | 'segmented';
type SegTab = 'original' | 'clean';

// ── Helpers ───────────────────────────────────────────────────────────────────

function countLowConf(md: string): number {
  return (md.match(/\[\?]/g) ?? []).length;
}

/**
 * Derives a title from the markdown:
 * 1. First # or ## heading text.
 * 2. First non-empty line (stripped of markdown syntax).
 * 3. "Untitled note".
 */
function deriveTitle(md: string): string {
  for (const line of md.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const headingMatch = trimmed.match(/^#{1,2}\s+(.+)/);
    if (headingMatch) return headingMatch[1].trim();
    // First non-empty line — strip leading markdown syntax chars
    return trimmed.replace(/^[#*_`>~\-+]+\s*/, '').trim() || 'Untitled note';
  }
  return 'Untitled note';
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ReviewScreen({
  jobId,
  initialMarkdown,
  wordCount,
  langPair,
  ocrConfidence,
  originalImageUrl,
  forceLayout,
}: ReviewScreenProps) {
  const router = useRouter();

  // Layout: default to 'segmented' during SSR to avoid hydration mismatch.
  // A useEffect picks the correct layout client-side.
  const [layout, setLayout] = useState<Layout>(forceLayout ?? 'segmented');
  const [segTab, setSegTab] = useState<SegTab>('clean');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInputVisible, setTagInputVisible] = useState(false);
  const [tagInputValue, setTagInputValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const editorRef = useRef<NoteEditorHandle>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);

  const lowConfCount = countLowConf(initialMarkdown);

  // Choose layout based on viewport width (client-side only)
  useEffect(() => {
    if (forceLayout) return;
    const wide = window.matchMedia('(min-width: 641px)').matches;
    setLayout(wide ? 'stacked' : 'segmented');
  }, [forceLayout]);

  // Focus tag input when it appears
  useEffect(() => {
    if (tagInputVisible) {
      setTimeout(() => tagInputRef.current?.focus(), 0);
    }
  }, [tagInputVisible]);

  // ── Tag handlers ─────────────────────────────────────────────────────────

  const commitTag = useCallback(
    (raw: string) => {
      const value = raw.trim().toLowerCase();
      if (!value) {
        setTagInputVisible(false);
        setTagInputValue('');
        return;
      }
      if (tags.includes(value)) {
        setTagInputValue('');
        return;
      }
      if (tags.length >= 20) {
        setToastMessage('You can add up to 20 tags per note.');
        setTagInputValue('');
        setTagInputVisible(false);
        return;
      }
      setTags((prev) => [...prev, value]);
      setTagInputValue('');
    },
    [tags],
  );

  const handleTagInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        commitTag(tagInputValue);
      } else if (e.key === 'Escape') {
        setTagInputVisible(false);
        setTagInputValue('');
      }
    },
    [tagInputValue, commitTag],
  );

  const handleTagInputBlur = useCallback(() => {
    commitTag(tagInputValue);
    setTagInputVisible(false);
  }, [tagInputValue, commitTag]);

  const removeTag = useCallback((tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  }, []);

  // ── Save handler ──────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const markdown = editorRef.current?.getMarkdown() ?? initialMarkdown;
      const title = deriveTitle(markdown);

      const res = await fetch('/api/notes/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, title, markdown, tags }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = (await res.json()) as {
        noteId: string;
        title: string;
        wordCount: number;
        highlights: number;
        langPair: string;
        ocrConfidence: number;
      };

      const params = new URLSearchParams({
        noteId: data.noteId,
        title: data.title,
        wordCount: String(data.wordCount),
        highlights: String(data.highlights),
        langPair: data.langPair,
        ocrConfidence: String(data.ocrConfidence),
      });
      router.push(`/capture/success?${params.toString()}`);
    } catch {
      setToastMessage("Couldn't save your note — try again.");
    } finally {
      setSaving(false);
    }
  }, [jobId, initialMarkdown, tags, router]);

  // ── Shared sub-components ─────────────────────────────────────────────────

  const tagSection = (
    <div className="tmn-review-tags">
      {tags.map((tag) => (
        <Tag key={tag} tone="brand" hash onRemove={() => removeTag(tag)}>
          {tag}
        </Tag>
      ))}
      {tagInputVisible ? (
        <input
          ref={tagInputRef}
          type="text"
          className="tmn-review-tag-input"
          placeholder="Tag name…"
          value={tagInputValue}
          onChange={(e) => setTagInputValue(e.target.value)}
          onKeyDown={handleTagInputKeyDown}
          onBlur={handleTagInputBlur}
          aria-label="Add tag"
        />
      ) : (
        <Tag onClick={() => setTagInputVisible(true)}>+ add tag</Tag>
      )}
    </div>
  );

  const imageOrPlaceholder = originalImageUrl ? (
    <div className="tmn-review-image-frame">
      <img src={originalImageUrl} alt="Original handwriting" />
    </div>
  ) : (
    <div className="tmn-review-image-placeholder">
      <Icon name="image-off" size={36} />
    </div>
  );

  // ── ActionBar contents differ by layout ──────────────────────────────────

  const actionBar = (
    <ActionBar>
      {layout === 'segmented' && (
        <IconButton
          label="Highlight"
          variant="soft"
          onClick={() => editorRef.current?.toggleHighlight()}
        >
          <Icon name="highlighter" size={19} />
        </IconButton>
      )}
      <IconButton
        label="Discard"
        variant="soft"
        onClick={() => router.push('/capture')}
      >
        <Icon name="trash-2" size={19} />
      </IconButton>
      <Button
        variant="primary"
        fullWidth
        leftIcon={<Icon name="check" size={18} />}
        loading={saving}
        onClick={handleSave}
      >
        Save to notebook
      </Button>
    </ActionBar>
  );

  // ── Header (shared) ───────────────────────────────────────────────────────

  const header = (
    <div className="tmn-review-header">
      <IconButton label="Back" variant="plain" onClick={() => router.back()}>
        <Icon name="chevron-left" size={24} />
      </IconButton>
      <span className="tmn-review-title">Review transcription</span>
      <IconButton label="More" variant="plain">
        <Icon name="more-horizontal" size={22} />
      </IconButton>
    </div>
  );

  // ── Stacked layout ────────────────────────────────────────────────────────

  if (layout === 'stacked') {
    return (
      <div className="tmn-review-screen">
        {header}

        <div className="tmn-review-body">
          {/* Original section */}
          <div className="tmn-review-label-row">
            <span className="tmn-review-label">Original</span>
            {lowConfCount > 0 && (
              <Badge tone="warning" dot>
                {lowConfCount} words to check
              </Badge>
            )}
          </div>

          {imageOrPlaceholder}

          {/* Clean / editable section */}
          <div className="tmn-review-editor-section">
            <div className="tmn-review-editor-section-label-row">
              <span className={cn('tmn-review-label', 'tmn-review-label--brand')}>
                Clean — editable
              </span>
              <span className="tmn-review-meta">
                {langPair} · OCR {ocrConfidence}%
              </span>
            </div>

            <NoteEditor
              ref={editorRef}
              initialMarkdown={initialMarkdown}
            />

            {/* Info hint */}
            <p className="tmn-review-hint">
              <Icon name="info" size={14} style={{ color: 'var(--warning)' }} />
              Tap any{' '}
              <span style={{ borderBottom: '2px dotted var(--warning)' }}>underlined</span>{' '}
              word to fix a low-confidence read.
            </p>
          </div>

          {tagSection}
        </div>

        {actionBar}
      </div>
    );
  }

  // ── Segmented layout ──────────────────────────────────────────────────────

  return (
    <div className="tmn-review-screen">
      {header}

      <div className="tmn-review-body">
        {/* Segmented control */}
        <div className="tmn-review-seg-header">
          <SegmentedControl
            value={segTab}
            onChange={(v) => setSegTab(v as SegTab)}
            options={[
              {
                value: 'original',
                label: 'Original',
                icon: <Icon name="scan-line" size={15} />,
              },
              {
                value: 'clean',
                label: 'Clean',
                icon: <Icon name="sparkles" size={15} />,
              },
            ]}
          />
        </div>

        {/* Metadata row */}
        <div className="tmn-review-seg-meta">
          <span className="tmn-review-meta">
            {langPair} · {wordCount} words · OCR {ocrConfidence}%
          </span>
        </div>

        {/* Original image — visible only when segTab === 'original' */}
        <div className={cn(segTab !== 'original' && 'tmn-review-hidden')}>
          {imageOrPlaceholder}
        </div>

        {/* NoteEditor — always mounted, hidden when viewing Original */}
        <div className={cn(segTab !== 'clean' && 'tmn-review-hidden')}>
          <NoteEditor
            ref={editorRef}
            initialMarkdown={initialMarkdown}
          />
        </div>

        {tagSection}
      </div>

      {actionBar}
    </div>
  );
}
