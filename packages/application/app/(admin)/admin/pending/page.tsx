'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AdminShell, EmptyPanel } from '@/src/components/admin';
import { Avatar, Badge, Button, Card, Icon, Toast } from '@/src/components/ui';
import { relativeTime, formatAvgWait } from '@/lib/relative-time';
import type { AccessRequestItem } from '@transformmynotes/core';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ToastState {
  tone: 'success' | 'neutral' | 'danger';
  icon: React.ReactNode;
  title: string;
  body: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function firstName(req: AccessRequestItem): string {
  const n = req.name?.trim();
  if (n) return n.split(' ')[0]!;
  return req.email;
}

async function callApi(
  url: string,
): Promise<{ ok: boolean; emailSent?: boolean; codeDisplay?: string; error?: string }> {
  const res = await fetch(url, { method: 'POST' });
  const body = await res.json().catch(() => ({ ok: false, error: 'Unknown error' }));
  if (!res.ok || !body.ok) {
    return { ok: false, error: body.error ?? `HTTP ${res.status}` };
  }
  return body;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminPendingPage() {
  const [rows, setRows] = useState<AccessRequestItem[] | null>(null);
  const [fetchError, setFetchError] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [approveAllBusy, setApproveAllBusy] = useState(false);
  // How many the admin approved in this session
  const [sessionApproved, setSessionApproved] = useState(0);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // -------------------------------------------------------------------------
  // Fetch
  // -------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/access-requests?status=new')
      .then((r) => r.json())
      .then((data: { ok: boolean; requests?: AccessRequestItem[] }) => {
        if (cancelled) return;
        if (data.ok && Array.isArray(data.requests)) {
          setRows(data.requests);
        } else {
          setFetchError(true);
        }
      })
      .catch(() => {
        if (!cancelled) setFetchError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // -------------------------------------------------------------------------
  // Toast helpers
  // -------------------------------------------------------------------------

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const showToast = useCallback((next: ToastState) => {
    if (toastTimerRef.current !== null) clearTimeout(toastTimerRef.current);
    setToast(next);
    toastTimerRef.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const dismissToast = useCallback(() => {
    if (toastTimerRef.current !== null) clearTimeout(toastTimerRef.current);
    setToast(null);
  }, []);

  // -------------------------------------------------------------------------
  // Approve / Dismiss
  // -------------------------------------------------------------------------

  const approve = useCallback(
    async (id: string) => {
      if (!rows) return;
      const idx = rows.findIndex((r) => r.id === id);
      if (idx === -1) return;
      const reqItem = rows[idx]!;
      const fname = firstName(reqItem);

      // Optimistic remove
      setBusy((prev) => new Set(prev).add(id));
      setRows((prev) => (prev ? prev.filter((r) => r.id !== id) : prev));

      const result = await callApi(`/api/admin/access-requests/${id}/approve`);

      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });

      if (!result.ok) {
        // Restore at original index
        setRows((prev) => {
          if (!prev) return [reqItem];
          const next = [...prev];
          next.splice(idx, 0, reqItem);
          return next;
        });
        showToast({
          tone: 'danger',
          icon: <Icon name="x" size={20} />,
          title: `Couldn't approve ${fname} — please try again.`,
          body: result.error ?? 'An error occurred.',
        });
        return false;
      }

      setSessionApproved((c) => c + 1);
      showToast({
        tone: 'success',
        icon: <Icon name="check-check" size={20} />,
        title: `${fname} approved`,
        body: "Invite sent — they'll get an email to set their password.",
      });
      return true;
    },
    [rows, showToast],
  );

  const dismiss = useCallback(
    async (id: string) => {
      if (!rows) return;
      const idx = rows.findIndex((r) => r.id === id);
      if (idx === -1) return;
      const reqItem = rows[idx]!;
      const fname = firstName(reqItem);

      // Optimistic remove
      setBusy((prev) => new Set(prev).add(id));
      setRows((prev) => (prev ? prev.filter((r) => r.id !== id) : prev));

      const result = await callApi(`/api/admin/access-requests/${id}/dismiss`);

      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });

      if (!result.ok) {
        // Restore at original index
        setRows((prev) => {
          if (!prev) return [reqItem];
          const next = [...prev];
          next.splice(idx, 0, reqItem);
          return next;
        });
        showToast({
          tone: 'danger',
          icon: <Icon name="x" size={20} />,
          title: `Couldn't dismiss ${fname} — please try again.`,
          body: result.error ?? 'An error occurred.',
        });
        return;
      }

      showToast({
        tone: 'neutral',
        icon: <Icon name="x" size={20} />,
        title: `${fname}'s request dismissed`,
        body: 'Request dismissed — we let them know.',
      });
    },
    [rows, showToast],
  );

  // -------------------------------------------------------------------------
  // Approve all
  // -------------------------------------------------------------------------

  const approveAll = useCallback(async () => {
    if (!rows || rows.length === 0) return;
    setApproveAllBusy(true);
    // Snapshot the current list so we iterate a stable copy
    const snapshot = [...rows];
    for (const reqItem of snapshot) {
      await approve(reqItem.id);
    }
    setApproveAllBusy(false);
  }, [rows, approve]);

  // -------------------------------------------------------------------------
  // Derived stats
  // -------------------------------------------------------------------------

  const awaitingCount = rows?.length ?? 0;
  const avgWait = rows ? formatAvgWait(rows.map((r) => r.createdAt)) : '—';

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const approveAllButton = (
    <Button
      variant="secondary"
      size="md"
      leftIcon={<Icon name="check-check" size={17} />}
      onClick={approveAll}
      disabled={approveAllBusy || !rows || rows.length === 0}
    >
      Approve all
    </Button>
  );

  return (
    <AdminShell title="Pending registrations" eyebrow="Admin" actions={approveAllButton}>
      {/* Summary cards */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 22, flexWrap: 'wrap' }}>
        {(
          [
            ['Awaiting review', awaitingCount, 'var(--warning-500)'],
            ['Approved today', sessionApproved, 'var(--success-500)'],
            ['Avg. wait', avgWait, 'var(--brand-strong)'],
          ] as const
        ).map(([label, value, color], i) => (
          <Card key={i} padded style={{ flex: '1 1 120px', minWidth: 0 }}>
            <div
              style={{ fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 600 }}
            >
              {label}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: 30,
                fontWeight: 600,
                color,
                marginTop: 4,
              }}
            >
              {value}
            </div>
          </Card>
        ))}
      </div>

      {/* Loading state */}
      {rows === null && !fetchError && (
        <Card padded style={{ textAlign: 'center', padding: '40px 24px' }}>
          <span style={{ fontSize: 14.5, color: 'var(--text-muted)' }}>Loading…</span>
        </Card>
      )}

      {/* Fetch error */}
      {fetchError && (
        <EmptyPanel
          icon="cloud-off"
          title="Couldn't load registrations"
          sub="Please refresh to try again."
        />
      )}

      {/* Empty state */}
      {rows !== null && !fetchError && rows.length === 0 && (
        <EmptyPanel
          icon="inbox"
          title="You're all caught up"
          sub="No registrations are waiting for review."
        />
      )}

      {/* Rows */}
      {rows !== null && rows.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rows.map((reqItem) => {
            const isBusy = busy.has(reqItem.id);
            const fname = firstName(reqItem);
            return (
              <Card key={reqItem.id} padded>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <Avatar name={reqItem.name || reqItem.email} size="lg" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        flexWrap: 'wrap',
                      }}
                    >
                      <span
                        style={{
                          fontFamily: 'var(--font-serif)',
                          fontSize: 18,
                          fontWeight: 600,
                          color: 'var(--text-strong)',
                        }}
                      >
                        {reqItem.name || reqItem.email}
                      </span>
                      <Badge tone="warning" dot>
                        Access request
                      </Badge>
                    </div>
                    <div
                      style={{
                        fontSize: 13.5,
                        color: 'var(--text-muted)',
                        marginTop: 3,
                      }}
                    >
                      {reqItem.email} · requested {relativeTime(reqItem.createdAt)}
                    </div>
                    {reqItem.note && (
                      <div
                        style={{
                          fontSize: 13.5,
                          color: 'var(--text-body)',
                          marginTop: 6,
                          fontStyle: 'italic',
                        }}
                      >
                        &ldquo;{reqItem.note}&rdquo;
                      </div>
                    )}
                  </div>
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}
                  >
                    <Button
                      variant="ghost"
                      size="md"
                      aria-label={`Dismiss ${fname}`}
                      disabled={isBusy}
                      onClick={() => dismiss(reqItem.id)}
                    >
                      Dismiss
                    </Button>
                    <Button
                      variant="primary"
                      size="md"
                      aria-label={`Approve ${fname}`}
                      leftIcon={<Icon name="check" size={16} />}
                      disabled={isBusy}
                      onClick={() => approve(reqItem.id)}
                    >
                      Approve
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <Toast
          tone={toast.tone}
          icon={toast.icon}
          title={toast.title}
          onClose={dismissToast}
          duration={3200}
          style={{
            right: 'max(16px, env(safe-area-inset-right, 0px) + 16px)',
            bottom: 'max(16px, env(safe-area-inset-bottom, 0px) + 16px)',
            width: 'min(360px, calc(100vw - 32px))',
          }}
        >
          {toast.body}
        </Toast>
      )}
    </AdminShell>
  );
}
