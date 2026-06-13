'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AdminShell, EmptyPanel } from '@/src/components/admin';
import {
  Badge,
  Button,
  Card,
  Icon,
  Input,
  SegmentedControl,
  Select,
  Toast,
} from '@/src/components/ui';
import { statusTone, statusLabel } from '@/lib/admin-status';
import {
  inviteRecipientLabel,
  inviteCodeRef,
  inviteDetail,
  expiresAtForOption,
  type ExpiryOption,
} from '@/lib/invite-list';
import type { InviteItem } from '@transformmynotes/core';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CreateMode = 'email' | 'code';
type StatusFilter = 'all' | 'pending' | 'used' | 'expired' | 'revoked';

interface ToastState {
  tone: 'success' | 'neutral' | 'danger';
  icon: React.ReactNode;
  title: string;
  body: string;
}

// ---------------------------------------------------------------------------
// Grid layout constant (mirrors design spec)
// ---------------------------------------------------------------------------

const COLS = '1.8fr 1.2fr 0.9fr 1.1fr 0.6fr';

// ---------------------------------------------------------------------------
// Status filter options
// ---------------------------------------------------------------------------

const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'used', label: 'Used' },
  { value: 'expired', label: 'Expired' },
  { value: 'revoked', label: 'Revoked' },
];

const EXPIRY_OPTIONS: ExpiryOption[] = ['In 7 days', 'In 30 days'];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminInvitesPage() {
  // -------------------------------------------------------------------------
  // List state
  // -------------------------------------------------------------------------

  const [rows, setRows] = useState<InviteItem[] | null>(null);
  const [fetchError, setFetchError] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [busy, setBusy] = useState<Set<string>>(new Set());

  // -------------------------------------------------------------------------
  // Create form state
  // -------------------------------------------------------------------------

  const [createMode, setCreateMode] = useState<CreateMode>('email');
  const [email, setEmail] = useState('');
  const [codeLabel, setCodeLabel] = useState('');
  const [maxUses, setMaxUses] = useState(25);
  const [expiry, setExpiry] = useState<ExpiryOption>('In 30 days');
  const [role, setRole] = useState<'member' | 'admin'>('member');
  const [submitting, setSubmitting] = useState(false);

  // -------------------------------------------------------------------------
  // Toast state
  // -------------------------------------------------------------------------

  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    toastTimerRef.current = setTimeout(() => setToast(null), 6000);
  }, []);

  const dismissToast = useCallback(() => {
    if (toastTimerRef.current !== null) clearTimeout(toastTimerRef.current);
    setToast(null);
  }, []);

  // -------------------------------------------------------------------------
  // Fetch invites
  // -------------------------------------------------------------------------

  const fetchInvites = useCallback(
    (filter: StatusFilter) => {
      setFetchError(false);
      setRows(null);
      const url =
        filter === 'all'
          ? '/api/admin/invites'
          : `/api/admin/invites?status=${filter}`;
      let cancelled = false;
      fetch(url)
        .then((r) => r.json())
        .then((data: { ok: boolean; invites?: InviteItem[] }) => {
          if (cancelled) return;
          if (data.ok && Array.isArray(data.invites)) {
            setRows(data.invites);
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
    },
    [],
  );

  useEffect(() => {
    const cancel = fetchInvites(statusFilter);
    return cancel;
  }, [statusFilter, fetchInvites]);

  // -------------------------------------------------------------------------
  // Create invite (POST /api/admin/invites)
  // -------------------------------------------------------------------------

  const handleCreate = useCallback(async () => {
    // Client-side validation
    if (createMode === 'email') {
      if (!email.trim()) {
        showToast({
          tone: 'danger',
          icon: <Icon name="x" size={20} />,
          title: 'Email required',
          body: 'Please enter a recipient email address.',
        });
        return;
      }
    } else {
      if (!codeLabel.trim()) {
        showToast({
          tone: 'danger',
          icon: <Icon name="x" size={20} />,
          title: 'Label required',
          body: 'Please enter a label for the invite code.',
        });
        return;
      }
    }

    const expiresAt = expiresAtForOption(expiry, new Date());

    const body =
      createMode === 'email'
        ? { type: 'email' as const, email: email.trim(), expiresAt, role }
        : {
            type: 'code' as const,
            label: codeLabel.trim(),
            maxUses,
            expiresAt,
            role,
          };

    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({ ok: false, error: 'Invalid response' }));

      if (!data.ok) {
        showToast({
          tone: 'danger',
          icon: <Icon name="x" size={20} />,
          title: 'Failed to create invite',
          body: data.error ?? `HTTP ${res.status}`,
        });
        return;
      }

      // Success — show the code (only chance to see it)
      const codeDisplay: string = data.codeDisplay ?? '';
      let toastBody = `Code: ${codeDisplay} — copy it now, it won't be shown again.`;
      if (createMode === 'email' && data.emailSent === true) {
        toastBody = `Email sent. ${toastBody}`;
      } else if (createMode === 'email' && data.emailSent === false) {
        toastBody = `Email NOT sent — check mail config. ${toastBody}`;
      }

      showToast({
        tone: 'success',
        icon: <Icon name="check-check" size={20} />,
        title: 'Invite created',
        body: toastBody,
      });

      // Reset form
      setEmail('');
      setCodeLabel('');
      setMaxUses(25);
      setExpiry('In 30 days');
      setRole('member');

      // Re-fetch so the new invite appears
      fetchInvites(statusFilter);
    } finally {
      setSubmitting(false);
    }
  }, [
    createMode,
    email,
    codeLabel,
    maxUses,
    expiry,
    role,
    statusFilter,
    showToast,
    fetchInvites,
  ]);

  // -------------------------------------------------------------------------
  // Revoke invite (DELETE /api/admin/invites/:codeHash)
  // -------------------------------------------------------------------------

  const revokeInvite = useCallback(
    async (invite: InviteItem) => {
      const { codeHash } = invite;
      // Optimistic update
      setBusy((s) => new Set(s).add(codeHash));
      setRows((rs) =>
        rs
          ? rs.map((r) =>
              r.codeHash === codeHash ? { ...r, status: 'revoked' as const } : r,
            )
          : rs,
      );

      const res = await fetch(`/api/admin/invites/${codeHash}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({ ok: false }));

      setBusy((s) => {
        const n = new Set(s);
        n.delete(codeHash);
        return n;
      });

      if (!res.ok || !data.ok) {
        // Roll back
        setRows((rs) =>
          rs
            ? rs.map((r) => (r.codeHash === codeHash ? invite : r))
            : rs,
        );
        showToast({
          tone: 'danger',
          icon: <Icon name="x" size={20} />,
          title: 'Revoke failed — please try again.',
          body: data.error ?? `HTTP ${res.status}`,
        });
      }
    },
    [showToast],
  );

  // -------------------------------------------------------------------------
  // Derived: filtered visible rows
  // -------------------------------------------------------------------------

  const visible = rows
    ? rows.filter((inv) => {
        if (!query.trim()) return true;
        const q = query.trim().toLowerCase();
        return (
          inviteRecipientLabel(inv).toLowerCase().includes(q) ||
          inviteCodeRef(inv).toLowerCase().includes(q)
        );
      })
    : null;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <AdminShell
      title="Invites"
      search="Search invites"
      searchValue={query}
      onSearchChange={setQuery}
    >
      {/* ------------------------------------------------------------------ */}
      {/* Create invite card                                                   */}
      {/* ------------------------------------------------------------------ */}
      <Card padded accentBar style={{ marginBottom: 22 }}>
        {/* Card header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
          }}
        >
          <div>
            <div
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: 18,
                fontWeight: 600,
                color: 'var(--text-strong)',
              }}
            >
              Create an invite
            </div>
            <div
              style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}
            >
              Email a single person, or share a reusable code.
            </div>
          </div>
          <SegmentedControl
            value={createMode}
            onChange={(v) => setCreateMode(v as CreateMode)}
            options={[
              {
                value: 'email',
                label: 'Email invite',
                icon: <Icon name="mail" size={15} />,
              },
              {
                value: 'code',
                label: 'Shareable code',
                icon: <Icon name="ticket" size={15} />,
              },
            ]}
          />
        </div>

        {/* Form row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          {createMode === 'email' ? (
            <div style={{ flex: 1, minWidth: 200 }}>
              <Input
                label="Recipient email"
                placeholder="name@email.com"
                leadingIcon={<Icon name="mail" size={17} />}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
              />
            </div>
          ) : (
            <>
              <div style={{ flex: 1, minWidth: 160 }}>
                <Input
                  label="Code label"
                  placeholder="e.g. SPAN-201-FALL"
                  leadingIcon={<Icon name="ticket" size={17} />}
                  value={codeLabel}
                  onChange={(e) => setCodeLabel(e.target.value)}
                  disabled={submitting}
                />
              </div>
              <div style={{ width: 110 }}>
                <Input
                  label="Max uses"
                  type="number"
                  min={1}
                  value={maxUses}
                  onChange={(e) =>
                    setMaxUses(Math.max(1, parseInt(e.target.value, 10) || 1))
                  }
                  disabled={submitting}
                />
              </div>
            </>
          )}

          <div style={{ width: 170 }}>
            <Select
              label="Joins as"
              options={['Member', 'Admin']}
              value={role === 'admin' ? 'Admin' : 'Member'}
              onChange={(e) => setRole(e.target.value === 'Admin' ? 'admin' : 'member')}
              disabled={submitting}
            />
          </div>

          <div style={{ width: 150 }}>
            <Select
              label="Expires"
              options={EXPIRY_OPTIONS}
              value={expiry}
              onChange={(e) => setExpiry(e.target.value as ExpiryOption)}
              disabled={submitting}
            />
          </div>

          <Button
            variant="primary"
            size="md"
            leftIcon={<Icon name="send" size={16} />}
            disabled={submitting}
            onClick={() => void handleCreate()}
          >
            {createMode === 'email' ? 'Send invite' : 'Create code'}
          </Button>
        </div>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Status filter bar                                                    */}
      {/* ------------------------------------------------------------------ */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          margin: '0 2px 12px',
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--text-subtle)',
          }}
        >
          All invites
        </div>
        <SegmentedControl
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as StatusFilter)}
          options={STATUS_FILTER_OPTIONS}
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Loading                                                              */}
      {/* ------------------------------------------------------------------ */}
      {rows === null && !fetchError && (
        <Card padded style={{ textAlign: 'center', padding: '40px 24px' }}>
          <span style={{ fontSize: 14.5, color: 'var(--text-muted)' }}>
            Loading…
          </span>
        </Card>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Fetch error                                                          */}
      {/* ------------------------------------------------------------------ */}
      {fetchError && (
        <EmptyPanel
          icon="cloud-off"
          title="Couldn't load invites"
          sub="Please refresh to try again."
        />
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Empty (no invites at all)                                            */}
      {/* ------------------------------------------------------------------ */}
      {rows !== null && !fetchError && rows.length === 0 && (
        <EmptyPanel
          icon="ticket"
          title="No invites yet"
          sub="Create your first invite above."
        />
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Invites table                                                        */}
      {/* ------------------------------------------------------------------ */}
      {rows !== null && !fetchError && rows.length > 0 && (
        <Card padded={false}>
          {/* Header row */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: COLS,
              gap: 12,
              padding: '13px 22px',
              borderBottom: '1px solid var(--border-subtle)',
              fontSize: 11.5,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--text-subtle)',
            }}
          >
            <span>Recipient</span>
            <span>Code</span>
            <span>Status</span>
            <span>Detail</span>
            <span style={{ textAlign: 'right' }} />
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
              No invites match your search.
            </div>
          )}

          {/* Data rows */}
          {visible !== null &&
            visible.map((inv, idx) => {
              const isDimmed =
                inv.status === 'expired' || inv.status === 'revoked';
              const isRevocable =
                inv.status === 'pending' || inv.status === 'used';
              const isBusy = busy.has(inv.codeHash);

              return (
                <div
                  key={inv.codeHash}
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
                    opacity: isDimmed ? 0.6 : 1,
                  }}
                >
                  {/* Recipient cell */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 11,
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 9,
                        flex: 'none',
                        background: 'var(--surface-sunken)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Icon
                        name={inv.type === 'email' ? 'mail' : 'ticket'}
                        size={17}
                        style={{ color: 'var(--text-muted)' }}
                      />
                    </div>
                    <span
                      style={{
                        fontSize: 14,
                        color: 'var(--text-strong)',
                        fontWeight: 500,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {inviteRecipientLabel(inv)}
                    </span>
                  </div>

                  {/* Code ref cell */}
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 13,
                      color: 'var(--brand-strong)',
                      fontWeight: 600,
                    }}
                  >
                    {inviteCodeRef(inv)}
                  </span>

                  {/* Status badge cell */}
                  <div>
                    <Badge tone={statusTone(inv.status)} dot>
                      {statusLabel(inv.status)}
                    </Badge>
                  </div>

                  {/* Detail cell */}
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    {inviteDetail(inv)}
                  </span>

                  {/* Action cell */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'flex-end',
                      gap: 4,
                    }}
                  >
                    {isRevocable && (
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Revoke invite for ${inviteRecipientLabel(inv)}`}
                        disabled={isBusy}
                        onClick={() => void revokeInvite(inv)}
                      >
                        Revoke
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
        </Card>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Toast                                                                */}
      {/* ------------------------------------------------------------------ */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            right: 28,
            bottom: 28,
            width: 360,
            zIndex: 50,
          }}
        >
          <Toast
            tone={toast.tone}
            icon={toast.icon}
            title={toast.title}
            onClose={dismissToast}
            duration={6000}
          >
            {toast.body}
          </Toast>
        </div>
      )}
    </AdminShell>
  );
}
