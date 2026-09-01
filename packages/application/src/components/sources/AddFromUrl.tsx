'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/src/components/ui/Button';
import { Icon } from '@/src/components/ui/Icon';
import { Input } from '@/src/components/ui/Input';
import { friendlyFromUrlError } from '@/src/lib/sources-ui';
import { GenerateFromSource } from './GenerateFromSource';

// ── State machine ─────────────────────────────────────────────────────────────

type FetchPhase =
  | { phase: 'idle' }
  | { phase: 'fetching' }
  | { phase: 'failed'; message: string }
  | { phase: 'ready'; sourceId: string; title: string; deduplicated: boolean };

// ── Props ─────────────────────────────────────────────────────────────────────

export interface AddFromUrlProps {
  onSourceAdded?: () => void;
  autoFocusUrl?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AddFromUrl({ onSourceAdded, autoFocusUrl = false }: AddFromUrlProps) {
  const [url, setUrl] = useState('');
  const [state, setState] = useState<FetchPhase>({ phase: 'idle' });

  const mountedRef = useRef(true);
  const lastUrlRef = useRef('');

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ── Submit handler ─────────────────────────────────────────────────────────

  const handleFetch = useCallback(async (targetUrl: string) => {
    const trimmed = targetUrl.trim();
    if (!trimmed) return;

    lastUrlRef.current = trimmed;
    setState({ phase: 'fetching' });

    try {
      const res = await fetch('/api/sources/from-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      });

      if (!mountedRef.current) return;

      if (res.ok) {
        const data = (await res.json()) as {
          sourceId: string;
          status: string;
          title: string;
          deduplicated?: boolean;
        };
        if (!mountedRef.current) return;
        setState({
          phase: 'ready',
          sourceId: data.sourceId,
          title: data.title,
          deduplicated: data.deduplicated === true,
        });
        onSourceAdded?.();
      } else {
        if (!mountedRef.current) return;
        setState({ phase: 'failed', message: friendlyFromUrlError(res.status) });
      }
    } catch {
      if (!mountedRef.current) return;
      setState({ phase: 'failed', message: friendlyFromUrlError(500) });
    }
  }, [onSourceAdded]);

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      void handleFetch(url);
    },
    [url, handleFetch],
  );

  const handleRetry = useCallback(() => {
    void handleFetch(lastUrlRef.current);
  }, [handleFetch]);

  const isFetching = state.phase === 'fetching';
  const submitDisabled = isFetching || url.trim() === '';

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="mb-6 rounded-lg border border-border-default p-4 flex flex-col gap-3">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Input
          label="Article URL"
          type="url"
          placeholder="https://…"
          maxLength={2048}
          autoFocus={autoFocusUrl}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={isFetching}
          aria-label="Article URL"
        />
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          disabled={submitDisabled}
          leftIcon={
            isFetching
              ? <Icon name="loader-circle" size={16} className="animate-spin" />
              : <Icon name="arrow-right" size={16} />
          }
        >
          {isFetching ? 'Fetching article…' : 'Fetch article'}
        </Button>
      </form>

      {/* Status / error region — announced by screen readers */}
      <div aria-live="polite">
        {state.phase === 'failed' && (
          <div className="flex items-center gap-2 rounded-md bg-surface-sunken border border-border-default px-3 py-2 text-sm text-danger">
            <Icon name="x" size={14} className="shrink-0" />
            <span className="flex-1">{state.message}</span>
            <Button variant="ghost" size="sm" onClick={handleRetry}>
              Retry
            </Button>
          </div>
        )}

        {state.phase === 'ready' && (
          <div className="flex flex-col gap-2">
            {state.deduplicated && (
              <p className="text-xs text-text-muted">
                You&apos;ve already added this article — using the existing source.
              </p>
            )}
            <p className="text-sm font-medium">
              Article ready: {state.title}
            </p>
            <GenerateFromSource sourceId={state.sourceId} />
          </div>
        )}
      </div>
    </div>
  );
}

AddFromUrl.displayName = 'AddFromUrl';
