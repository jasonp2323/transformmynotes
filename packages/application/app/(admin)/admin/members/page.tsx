'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AdminShell, EmptyPanel, useAdminShell } from '@/src/components/admin';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Dialog,
  Icon,
  IconButton,
  Select,
  Toast,
} from '@/src/components/ui';
import { statusTone, statusLabel } from '@/lib/admin-status';
import { filterMembers } from '@/lib/filter-members';
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
// Grid layout constant (mirrors design spec)
// ---------------------------------------------------------------------------

const COLS = '2.4fr 1.1fr 0.9fr 0.7fr 0.5fr';

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminMembersPage() {
  const { userSub } = useAdminShell();

  const [rows, setRows] = useState<UserProfileItem[] | null>(null);
  const [fetchError, setFetchError] = useState(false);
  const [query, setQuery] = useState('');
  const [confirm, setConfirm] = useState<UserProfileItem | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // -------------------------------------------------------------------------
  // Fetch
  // -------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/users')
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
  // Role change (PATCH /api/admin/users/{sub}/role)
  // -------------------------------------------------------------------------

  const changeRole = useCallback(
    async (sub: string, role: 'admin' | 'member') => {
      if (!rows) return;
      const idx = rows.findIndex((r) => r.sub === sub);
      if (idx === -1) return;
      const prev = rows[idx]!;

      // Optimistic update
      setBusy((s) => new Set(s).add(sub));
      setRows((rs) =>
        rs ? rs.map((r) => (r.sub === sub ? { ...r, role } : r)) : rs,
      );

      const res = await fetch(`/api/admin/users/${sub}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      const body = await res.json().catch(() => ({ ok: false }));

      setBusy((s) => {
        const n = new Set(s);
        n.delete(sub);
        return n;
      });

      if (!res.ok || !body.ok) {
        // Roll back
        setRows((rs) =>
          rs ? rs.map((r) => (r.sub === sub ? prev : r)) : rs,
        );
        showToast({
          tone: 'danger',
          icon: <Icon name="x" size={20} />,
          title: 'Role change failed — please try again.',
          body: body.error ?? `HTTP ${res.status}`,
        });
      }
    },
    [rows, showToast],
  );

  // -------------------------------------------------------------------------
  // Toggle status (PATCH /api/admin/users/{sub}/status)
  // -------------------------------------------------------------------------

  const toggleStatus = useCallback(
    async (sub: string) => {
      if (!rows) return;
      const idx = rows.findIndex((r) => r.sub === sub);
      if (idx === -1) return;
      const prev = rows[idx]!;
      const nextStatus = prev.status === 'active' ? 'disabled' : 'active';

      // Optimistic update
      setBusy((s) => new Set(s).add(sub));
      setRows((rs) =>
        rs
          ? rs.map((r) => (r.sub === sub ? { ...r, status: nextStatus } : r))
          : rs,
      );

      const res = await fetch(`/api/admin/users/${sub}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const body = await res.json().catch(() => ({ ok: false }));

      setBusy((s) => {
        const n = new Set(s);
        n.delete(sub);
        return n;
      });

      if (!res.ok || !body.ok) {
        // Roll back
        setRows((rs) =>
          rs ? rs.map((r) => (r.sub === sub ? prev : r)) : rs,
        );
        showToast({
          tone: 'danger',
          icon: <Icon name="x" size={20} />,
          title: 'Status change failed — please try again.',
          body: body.error ?? `HTTP ${res.status}`,
        });
      }
    },
    [rows, showToast],
  );

  // -------------------------------------------------------------------------
  // Remove (DELETE /api/admin/users/{sub})
  // -------------------------------------------------------------------------

  const doRemove = useCallback(
    async (target: UserProfileItem | null) => {
      if (!target || !rows) return;
      const { sub } = target;
      const idx = rows.findIndex((r) => r.sub === sub);

      setBusy((s) => new Set(s).add(sub));
      setConfirm(null);

      const res = await fetch(`/api/admin/users/${sub}`, { method: 'DELETE' });
      const body = await res.json().catch(() => ({ ok: false }));

      setBusy((s) => {
        const n = new Set(s);
        n.delete(sub);
        return n;
      });

      if (!res.ok || !body.ok) {
        showToast({
          tone: 'danger',
          icon: <Icon name="x" size={20} />,
          title: 'Remove failed — please try again.',
          body: body.error ?? `HTTP ${res.status}`,
        });
        return;
      }

      // Remove from list
      setRows((rs) => (rs ? rs.filter((r) => r.sub !== sub) : rs));
      showToast({
        tone: 'neutral',
        icon: <Icon name="trash-2" size={20} />,
        title: `${target.name || target.email} permanently deleted`,
        body: 'Account removed from Cognito and database. Their email can now be invited again.',
      });
    },
    [rows, showToast],
  );

  // -------------------------------------------------------------------------
  // Derived
  // -------------------------------------------------------------------------

  const visible = rows ? filterMembers(rows, query) : null;

  // -------------------------------------------------------------------------
  // Invite member button (header action)
  // -------------------------------------------------------------------------

  const inviteButton = (
    <a href="/admin/invites" style={{ textDecoration: 'none' }}>
      <Button
        variant="primary"
        size="md"
        leftIcon={<Icon name="user-plus" size={17} />}
      >
        Invite member
      </Button>
    </a>
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <AdminShell
      title="Members"
      search="Search members"
      searchValue={query}
      onSearchChange={setQuery}
      actions={inviteButton}
    >
      {/* Loading */}
      {rows === null && !fetchError && (
        <Card padded style={{ textAlign: 'center', padding: '40px 24px' }}>
          <span style={{ fontSize: 14.5, color: 'var(--text-muted)' }}>
            Loading…
          </span>
        </Card>
      )}

      {/* Fetch error */}
      {fetchError && (
        <EmptyPanel
          icon="cloud-off"
          title="Couldn't load members"
          sub="Please refresh to try again."
        />
      )}

      {/* Empty (no members at all) */}
      {rows !== null && !fetchError && rows.length === 0 && (
        <EmptyPanel
          icon="users"
          title="No members yet"
          sub="Approved members will appear here."
        />
      )}

      {/* Table */}
      {rows !== null && !fetchError && rows.length > 0 && (
        <Card padded={false}>
          <div style={{ overflowX: 'auto' }}>
          {/* Header row */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: COLS,
              gap: 12,
              padding: '14px 22px',
              borderBottom: '1px solid var(--border-subtle)',
              fontSize: 11.5,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--text-subtle)',
              minWidth: 640,
            }}
          >
            <span>Member</span>
            <span>Role</span>
            <span>Status</span>
            <span>Notes</span>
            <span style={{ textAlign: 'right' }}>Manage</span>
          </div>

          {/* Filtered-to-empty message */}
          {visible !== null && visible.length === 0 && (
            <div
              style={{
                padding: '28px 22px',
                fontSize: 14,
                color: 'var(--text-subtle)',
                textAlign: 'center',
              }}
            >
              No members match your search.
            </div>
          )}

          {/* Data rows */}
          {visible !== null &&
            visible.map((u, idx) => {
              const isSelf = u.sub === userSub;
              const isBusy = busy.has(u.sub);
              const isActive = u.status === 'active';

              return (
                <div
                  key={u.sub}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: COLS,
                    gap: 12,
                    padding: '14px 22px',
                    alignItems: 'center',
                    borderBottom:
                      idx < visible.length - 1
                        ? '1px solid var(--border-subtle)'
                        : 'none',
                    opacity: u.status === 'disabled' ? 0.62 : 1,
                    minWidth: 640,
                  }}
                >
                  {/* Member cell */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      minWidth: 0,
                    }}
                  >
                    <Avatar name={u.name || u.email} size="md" />
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 14.5,
                          fontWeight: 600,
                          color: 'var(--text-strong)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 7,
                        }}
                      >
                        {u.name || u.email}
                        {isSelf && (
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              color: 'var(--text-subtle)',
                            }}
                          >
                            (you)
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: 12.5,
                          color: 'var(--text-subtle)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {u.email}
                      </div>
                    </div>
                  </div>

                  {/* Role cell */}
                  <div>
                    <Select
                      aria-label={`Role for ${u.name || u.email}`}
                      value={u.role === 'admin' ? 'Admin' : 'Member'}
                      options={['Admin', 'Member']}
                      disabled={isBusy}
                      onChange={(e) => {
                        const mapped: 'admin' | 'member' =
                          e.target.value === 'Admin' ? 'admin' : 'member';
                        void changeRole(u.sub, mapped);
                      }}
                    />
                  </div>

                  {/* Status cell */}
                  <div>
                    <Badge tone={statusTone(u.status)} dot>
                      {statusLabel(u.status)}
                    </Badge>
                  </div>

                  {/* Notes cell */}
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 13,
                      color: 'var(--text-muted)',
                    }}
                  >
                    {u.noteCount}
                  </div>

                  {/* Manage cell */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      gap: 4,
                    }}
                  >
                    {/* Grant access (disabled rows) / Disable (active rows) */}
                    {!isActive ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        leftIcon={<Icon name="circle-check" size={15} />}
                        disabled={isBusy}
                        aria-label={`Grant access to ${u.name || u.email}`}
                        onClick={() => void toggleStatus(u.sub)}
                      >
                        Grant access
                      </Button>
                    ) : (
                      <IconButton
                        variant="plain"
                        size="sm"
                        label={`Disable ${u.name || u.email}`}
                        disabled={isBusy || isSelf}
                        onClick={() => void toggleStatus(u.sub)}
                      >
                        <Icon name="ban" size={18} />
                      </IconButton>
                    )}

                    {/* Remove */}
                    <IconButton
                      variant="plain"
                      size="sm"
                      label={`Remove ${u.name || u.email}`}
                      disabled={isBusy || isSelf}
                      onClick={() => {
                        if (!isSelf) setConfirm(u);
                      }}
                    >
                      <Icon
                        name="trash-2"
                        size={17}
                        style={{
                          color: isSelf
                            ? 'var(--text-subtle)'
                            : 'var(--danger-500)',
                        }}
                      />
                    </IconButton>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Remove confirmation dialog */}
      <Dialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title="Permanently delete member?"
        description={
          confirm
            ? `${confirm.name || confirm.email} will be permanently deleted from Cognito and the database, and their ${confirm.noteCount} notes archived. This frees their email to be invited again. This can't be undone.`
            : ''
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void doRemove(confirm)}>
              Delete permanently
            </Button>
          </>
        }
      />

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
