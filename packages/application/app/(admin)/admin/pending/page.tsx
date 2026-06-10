'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AdminShell, EmptyPanel } from '@/src/components/admin';
import { Avatar, Badge, Button, Card, Icon, Toast } from '@/src/components/ui';
import { relativeTime, formatAvgWait } from '@/lib/relative-time';
import type { UserProfileItem } from '@transformmynotes/core';

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

function firstName(profile: UserProfileItem): string {
  const n = profile.name?.trim();
  if (n) return n.split(' ')[0]!;
  return profile.email;
}

async function callApi(
  url: string,
): Promise<{ ok: boolean; emailSent?: boolean; error?: string }> {
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
  const [rows, setRows] = useState<UserProfileItem[] | null>(null);
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
    fetch('/api/admin/users/pending')
      .then((r) => r.json())
      .then((data: { ok: boolean; users?: UserProfileItem[] }) => {
        if (cancelled) return;
        if (data.ok && Array.isArray(data.users)) {
          setRows(data.users);
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
  // Approve / Reject
  // -------------------------------------------------------------------------

  const approve = useCallback(
    async (sub: string) => {
      if (!rows) return;
      const idx = rows.findIndex((r) => r.sub === sub);
      if (idx === -1) return;
      const profile = rows[idx]!;
      const fname = firstName(profile);

      // Optimistic remove
      setBusy((prev) => new Set(prev).add(sub));
      setRows((prev) => (prev ? prev.filter((r) => r.sub !== sub) : prev));

      const result = await callApi(`/api/admin/users/${sub}/approve`);

      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(sub);
        return next;
      });

      if (!result.ok) {
        // Restore at original index
        setRows((prev) => {
          if (!prev) return [profile];
          const next = [...prev];
          next.splice(idx, 0, profile);
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
        body: 'They can sign in now — we sent the welcome email.',
      });
      return true;
    },
    [rows, showToast],
  );

  const reject = useCallback(
    async (sub: string) => {
      if (!rows) return;
      const idx = rows.findIndex((r) => r.sub === sub);
      if (idx === -1) return;
      const profile = rows[idx]!;
      const fname = firstName(profile);

      // Optimistic remove
      setBusy((prev) => new Set(prev).add(sub));
      setRows((prev) => (prev ? prev.filter((r) => r.sub !== sub) : prev));

      const result = await callApi(`/api/admin/users/${sub}/reject`);

      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(sub);
        return next;
      });

      if (!result.ok) {
        // Restore at original index
        setRows((prev) => {
          if (!prev) return [profile];
          const next = [...prev];
          next.splice(idx, 0, profile);
          return next;
        });
        showToast({
          tone: 'danger',
          icon: <Icon name="x" size={20} />,
          title: `Couldn't reject ${fname} — please try again.`,
          body: result.error ?? 'An error occurred.',
        });
        return;
      }

      showToast({
        tone: 'neutral',
        icon: <Icon name="x" size={20} />,
        title: `${fname}'s request declined`,
        body: 'They’ve been notified by email.',
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
    for (const profile of snapshot) {
      await approve(profile.sub);
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
      <div style={{ display: 'flex', gap: 14, marginBottom: 22 }}>
        {(
          [
            ['Awaiting review', awaitingCount, 'var(--warning-500)'],
            ['Approved today', sessionApproved, 'var(--success-500)'],
            ['Avg. wait', avgWait, 'var(--brand-strong)'],
          ] as const
        ).map(([label, value, color], i) => (
          <Card key={i} padded style={{ flex: 1 }}>
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
          {rows.map((profile) => {
            const isBusy = busy.has(profile.sub);
            const fname = firstName(profile);
            return (
              <Card key={profile.sub} padded>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <Avatar name={profile.name || profile.email} size="lg" />
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
                        {profile.name || profile.email}
                      </span>
                      {profile.groupIds.length > 0 ? (
                        <Badge tone="brand">Invited</Badge>
                      ) : (
                        <Badge tone="warning" dot>
                          No invite code
                        </Badge>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 13.5,
                        color: 'var(--text-muted)',
                        marginTop: 3,
                      }}
                    >
                      {profile.email} · requested {relativeTime(profile.createdAt)}
                    </div>
                    {profile.auditNotes && (
                      <div
                        style={{
                          fontSize: 13.5,
                          color: 'var(--text-body)',
                          marginTop: 6,
                          fontStyle: 'italic',
                        }}
                      >
                        &ldquo;{profile.auditNotes}&rdquo;
                      </div>
                    )}
                  </div>
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}
                  >
                    <Button
                      variant="ghost"
                      size="md"
                      disabled={isBusy}
                      onClick={() => reject(profile.sub)}
                    >
                      Reject
                    </Button>
                    <Button
                      variant="primary"
                      size="md"
                      leftIcon={<Icon name="check" size={16} />}
                      disabled={isBusy}
                      onClick={() => approve(profile.sub)}
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
        <div
          style={{
            position: 'fixed',
            right: 28,
            bottom: 28,
            width: 340,
            zIndex: 50,
          }}
        >
          <Toast
            tone={toast.tone}
            icon={toast.icon}
            title={toast.title}
            onClose={dismissToast}
            duration={3200}
          >
            {toast.body}
          </Toast>
        </div>
      )}
    </AdminShell>
  );
}
