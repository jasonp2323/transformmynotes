'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Source } from '@transformmynotes/core';
import { AppShell } from '@/src/components/shells';
import { Badge } from '@/src/components/ui/Badge';
import { Button } from '@/src/components/ui/Button';
import { Icon } from '@/src/components/ui/Icon';
import { Toast } from '@/src/components/ui/Toast';
import { relativeTime } from '@/src/lib/library';
import { formatBytes, uploadSource } from '@/src/lib/sources-upload';
import { statusChipMeta, friendlyUploadError, isInFlight } from '@/src/lib/sources-ui';
import { GenerateFromSource } from './GenerateFromSource';

const ACCEPTED_TYPES = [
  '.pdf',
  '.docx',
  '.epub',
  '.txt',
  '.md',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/epub+zip',
  'text/plain',
  'text/markdown',
].join(',');

// ── Status badge ──────────────────────────────────────────────────────────────

function SourceStatusChip({ status }: { status: Source['status'] }) {
  const meta = statusChipMeta(status);
  return (
    <Badge tone={meta.tone}>
      {meta.spin && <Icon name="loader-circle" size={11} className="animate-spin mr-1" />}
      {meta.label}
    </Badge>
  );
}

// ── Optimistic / temp row type ────────────────────────────────────────────────

interface TempSource extends Omit<Source, 'sourceId' | 'originalFormat' | 'originalS3Key' | 'createdAt' | 'updatedAt'> {
  _tempId: string;
  sourceId: string;
  originalFormat: Source['originalFormat'];
  originalS3Key: string;
  createdAt: string;
  updatedAt: string;
}

type SourceRow = Source | TempSource;

function isTempSource(row: SourceRow): row is TempSource {
  return '_tempId' in row;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface ToastState {
  tone: 'success' | 'danger' | 'neutral' | 'warning';
  title: string;
}

const POLL_INTERVAL_MS = 3000;

export function SourcesScreen() {
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch list ─────────────────────────────────────────────────────────────

  const fetchSources = useCallback(async () => {
    try {
      const res = await fetch('/api/sources');
      if (!mountedRef.current) return;
      if (!res.ok) throw new Error('Failed to load sources');
      const data = (await res.json()) as { sources: Source[] };
      if (!mountedRef.current) return;
      setSources(data.sources);
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void fetchSources();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchSources]);

  // ── Polling for in-flight rows ─────────────────────────────────────────────

  useEffect(() => {
    const inFlight = sources.filter(
      (s) => !isTempSource(s) && isInFlight(s.status),
    ) as Source[];

    if (inFlight.length === 0) {
      if (pollIntervalRef.current !== null) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }

    if (pollIntervalRef.current !== null) return; // already polling

    pollIntervalRef.current = setInterval(() => {
      if (!mountedRef.current) return;

      void (async () => {
        const current = sources.filter(
          (s) => !isTempSource(s) && isInFlight(s.status),
        ) as Source[];

        await Promise.all(
          current.map(async (source) => {
            try {
              const res = await fetch(`/api/sources/${source.sourceId}`);
              if (!mountedRef.current) return;
              if (!res.ok) return;
              const data = (await res.json()) as { source: Source };
              if (!mountedRef.current) return;
              setSources((prev) =>
                prev.map((s) =>
                  !isTempSource(s) && s.sourceId === source.sourceId ? data.source : s,
                ),
              );
            } catch {
              // ignore transient errors; will retry next tick
            }
          }),
        );
      })();
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollIntervalRef.current !== null) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources.map((s) => (!isTempSource(s) ? `${s.sourceId}:${s.status}` : s._tempId)).join(',')]);

  // Cleanup poll interval on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (pollIntervalRef.current !== null) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, []);

  // ── Retry failed source ────────────────────────────────────────────────────

  const handleRetry = useCallback(async (sourceId: string) => {
    // Optimistically set to extracting
    setSources((prev) =>
      prev.map((s) =>
        !isTempSource(s) && s.sourceId === sourceId ? { ...s, status: 'extracting' as const } : s,
      ),
    );

    try {
      const res = await fetch(`/api/sources/${sourceId}/extract`, { method: 'POST' });
      if (!mountedRef.current) return;
      if (!res.ok) {
        let errorKey = 'extract_failed';
        try {
          const body = (await res.json()) as { error?: string };
          if (body.error) errorKey = body.error;
        } catch {
          // ignore
        }
        setSources((prev) =>
          prev.map((s) =>
            !isTempSource(s) && s.sourceId === sourceId
              ? { ...s, status: 'failed' as const, error: errorKey }
              : s,
          ),
        );
        setToast({ tone: 'danger', title: 'Retry failed — please try again.' });
      }
      // Success: polling will pick up the status change
    } catch {
      if (!mountedRef.current) return;
      setSources((prev) =>
        prev.map((s) =>
          !isTempSource(s) && s.sourceId === sourceId
            ? { ...s, status: 'failed' as const }
            : s,
        ),
      );
      setToast({ tone: 'danger', title: 'Network error — please try again.' });
    }
  }, []);

  // ── File upload handler ────────────────────────────────────────────────────

  const handleFile = useCallback(
    async (file: File) => {
      const tempId = `temp-${Date.now()}`;
      const now = new Date().toISOString();

      // Optimistic row
      const tempRow: TempSource = {
        _tempId: tempId,
        sourceId: tempId,
        type: 'document',
        title: file.name,
        status: 'uploading',
        originalFormat: 'txt', // placeholder; replaced by real data after fetch
        originalS3Key: '',
        byteSize: file.size,
        createdAt: now,
        updatedAt: now,
      };

      setSources((prev) => [tempRow, ...prev]);

      try {
        await uploadSource(file);
        if (!mountedRef.current) return;
        // Replace the temp row with real data by refetching
        setSources((prev) => prev.filter((s) => !isTempSource(s) || s._tempId !== tempId));
        await fetchSources();
      } catch (err: unknown) {
        if (!mountedRef.current) return;
        setSources((prev) => prev.filter((s) => !isTempSource(s) || s._tempId !== tempId));
        const errorKey = err instanceof Error ? err.message : 'upload_failed';
        setToast({ tone: 'danger', title: friendlyUploadError(errorKey) });
      }
    },
    [fetchSources],
  );

  // ── File input / drag-and-drop ─────────────────────────────────────────────

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void handleFile(file);
      // Reset so the same file can be re-uploaded
      e.target.value = '';
    },
    [handleFile],
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void handleFile(file);
    },
    [handleFile],
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <AppShell active="sources" title="Sources">
      <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-2xl mx-auto">

        {/* Drop zone + upload button */}
        <div
          className={[
            'mb-6 rounded-lg border-2 border-dashed p-6 flex flex-col items-center gap-3 transition-colors',
            dragActive
              ? 'border-brand bg-surface-sunken'
              : 'border-border-default',
          ].join(' ')}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <Icon name="file-text" size={32} className="text-text-muted opacity-60" />
          <p className="text-sm text-text-muted text-center">
            Drag &amp; drop a document, or
          </p>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Icon name="plus" size={16} />}
            onClick={() => fileInputRef.current?.click()}
          >
            Upload document
          </Button>
          <p className="text-xs text-text-muted">PDF, DOCX, EPUB, TXT, MD</p>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            className="sr-only"
            aria-label="Upload document"
            onChange={handleInputChange}
          />
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-12">
            <Icon name="loader-circle" size={32} className="animate-spin text-text-muted" />
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="rounded-md bg-surface-sunken border border-border-default px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && sources.length === 0 && (
          <div className="flex flex-col items-center gap-4 py-16 text-center text-text-muted">
            <Icon name="file-text" size={48} className="opacity-40" />
            <div>
              <p className="font-medium text-text-strong">No sources yet</p>
              <p className="mt-1 text-sm">Upload a document to get started.</p>
            </div>
          </div>
        )}

        {/* Source list */}
        {!loading && !error && sources.length > 0 && (
          <ul className="divide-y divide-border-default" role="list">
            {sources.map((source) => {
              const isTemp = isTempSource(source);
              return (
                <li key={isTemp ? source._tempId : source.sourceId}>
                  <div className="w-full flex items-start gap-3 py-4">
                    {/* Format badge */}
                    <div className="mt-0.5 shrink-0">
                      {!isTemp && (
                        <Badge tone="neutral">
                          {source.originalFormat.toUpperCase()}
                        </Badge>
                      )}
                    </div>

                    {/* Title + error */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{source.title}</p>
                      {!isTemp && source.status === 'failed' && source.error && (
                        <p className="mt-0.5 text-xs text-danger line-clamp-2">{source.error}</p>
                      )}
                      {/* Generate button for ready sources */}
                      {!isTemp && source.status === 'ready' && (
                        <div className="mt-2">
                          <GenerateFromSource sourceId={source.sourceId} />
                        </div>
                      )}
                    </div>

                    {/* Right column: status + meta */}
                    <div className="shrink-0 flex flex-col items-end gap-1.5 ml-2">
                      <SourceStatusChip status={source.status} />
                      <span className="text-xs text-text-muted whitespace-nowrap">
                        {formatBytes(source.byteSize)}
                      </span>
                      <span className="text-xs text-text-muted whitespace-nowrap">
                        {relativeTime(source.createdAt)}
                      </span>
                      {/* Retry button for failed sources */}
                      {!isTemp && source.status === 'failed' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleRetry(source.sourceId)}
                        >
                          Retry
                        </Button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {toast && (
        <Toast
          tone={toast.tone}
          title={toast.title}
          onClose={() => setToast(null)}
          duration={4000}
        />
      )}
    </AppShell>
  );
}

SourcesScreen.displayName = 'SourcesScreen';
