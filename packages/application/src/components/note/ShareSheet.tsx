'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Avatar,
  Button,
  Checkbox,
  Dialog,
  Icon,
  SegmentedControl,
  Toast,
} from '@/src/components/ui';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ShareSheetProps {
  open: boolean;
  onClose: () => void;
  noteId: string;
  noteTitle: string;
  groupId?: string;
}

type ShareMode = 'group' | 'members';

interface Member {
  sub: string;
  name: string;
  role: 'member' | 'admin';
}

interface ShareRow {
  recipientSub: string;
  ownerName: string;
  noteTitle: string;
  groupId: string;
  sharedAt: string;
}

interface ToastState {
  tone: 'success' | 'danger';
  title: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ShareSheet({ open, onClose, noteId, noteTitle, groupId }: ShareSheetProps) {
  const [mode, setMode] = useState<ShareMode>('group');

  // Members state
  const [members, setMembers] = useState<Member[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Current shares state
  const [shares, setShares] = useState<ShareRow[]>([]);
  const [sharesLoading, setSharesLoading] = useState(false);

  // Confirm-revoke state: maps recipientSub → confirming
  const [revoking, setRevoking] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState<Set<string>>(new Set());

  // Sharing in-flight
  const [sharing, setSharing] = useState(false);

  // Toast
  const [toast, setToast] = useState<ToastState | null>(null);

  // AbortController refs
  const membersAbortRef = useRef<AbortController | null>(null);
  const sharesAbortRef = useRef<AbortController | null>(null);

  // ── Fetch current shares ──────────────────────────────────────────────────

  const fetchShares = useCallback(() => {
    if (!groupId) return;
    sharesAbortRef.current?.abort();
    const controller = new AbortController();
    sharesAbortRef.current = controller;

    setSharesLoading(true);
    fetch(`/api/notes/${noteId}/shares`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json() as Promise<{ ok: boolean; shares: ShareRow[] }>;
      })
      .then((data) => {
        setShares(data.shares);
        setSharesLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === 'AbortError') return;
        setSharesLoading(false);
      });
  }, [noteId, groupId]);

  // ── Fetch group members ───────────────────────────────────────────────────

  const fetchMembers = useCallback(() => {
    if (!groupId) return;
    membersAbortRef.current?.abort();
    const controller = new AbortController();
    membersAbortRef.current = controller;

    setMembersLoading(true);
    fetch(`/api/groups/${groupId}/members`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json() as Promise<{ ok: boolean; members: Member[] }>;
      })
      .then((data) => {
        setMembers(data.members);
        setMembersLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === 'AbortError') return;
        setMembersLoading(false);
      });
  }, [groupId]);

  // Fetch on open or when noteId/groupId changes
  useEffect(() => {
    if (open && groupId) {
      fetchShares();
      if (mode === 'members') {
        fetchMembers();
      }
    }
    return () => {
      membersAbortRef.current?.abort();
      sharesAbortRef.current?.abort();
    };
  }, [open, groupId, fetchShares, fetchMembers, mode]);

  // Fetch members when switching to members mode
  useEffect(() => {
    if (open && mode === 'members' && groupId && members.length === 0 && !membersLoading) {
      fetchMembers();
    }
  }, [mode, open, groupId, members.length, membersLoading, fetchMembers]);

  // Reset state when closed
  useEffect(() => {
    if (!open) {
      setSelected(new Set());
      setMode('group');
      setConfirming(new Set());
      setRevoking(new Set());
      setToast(null);
    }
  }, [open]);

  // ── Toggle member selection ───────────────────────────────────────────────

  function toggleMember(sub: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(sub)) {
        next.delete(sub);
      } else {
        next.add(sub);
      }
      return next;
    });
  }

  // ── Share ─────────────────────────────────────────────────────────────────

  async function handleShare() {
    setSharing(true);
    try {
      const body =
        mode === 'group'
          ? { groupId }
          : { recipientSubs: [...selected] };

      const res = await fetch(`/api/notes/${noteId}/shares`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = (await res.json()) as { ok: boolean; created?: number; error?: string };

      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

      setToast({ tone: 'success', title: `Shared with ${data.created ?? 0} member${data.created === 1 ? '' : 's'}` });
      setSelected(new Set());
      fetchShares();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setToast({ tone: 'danger', title: `Couldn't share — ${msg}` });
    } finally {
      setSharing(false);
    }
  }

  // ── Revoke ────────────────────────────────────────────────────────────────

  function startRevoke(recipientSub: string) {
    setConfirming((prev) => new Set(prev).add(recipientSub));
  }

  function cancelRevoke(recipientSub: string) {
    setConfirming((prev) => {
      const next = new Set(prev);
      next.delete(recipientSub);
      return next;
    });
  }

  async function confirmRevoke(recipientSub: string) {
    setRevoking((prev) => new Set(prev).add(recipientSub));
    try {
      const res = await fetch(`/api/notes/${noteId}/shares/${encodeURIComponent(recipientSub)}`, {
        method: 'DELETE',
      });

      if (!res.ok && res.status !== 204) {
        throw new Error(`HTTP ${res.status}`);
      }

      // Remove from local state
      setShares((prev) => prev.filter((s) => s.recipientSub !== recipientSub));
      setConfirming((prev) => {
        const next = new Set(prev);
        next.delete(recipientSub);
        return next;
      });
    } catch {
      setToast({ tone: 'danger', title: "Couldn't revoke — try again" });
    } finally {
      setRevoking((prev) => {
        const next = new Set(prev);
        next.delete(recipientSub);
        return next;
      });
    }
  }

  // ── Derive display name for a recipientSub ────────────────────────────────

  function resolveRecipientName(recipientSub: string): string {
    const member = members.find((m) => m.sub === recipientSub);
    if (member) return member.name;
    // Truncate raw sub if no member record available
    return recipientSub.length > 16 ? `${recipientSub.slice(0, 8)}…` : recipientSub;
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const shareDisabled = sharing || (mode === 'members' && selected.size === 0);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      className="tmn-share-sheet"
    >
      {/* Eyebrow */}
      <div className="tmn-share-sheet__eyebrow">
        SHARING &ldquo;{noteTitle.toUpperCase()}&rdquo;
      </div>

      {/* No-group message */}
      {!groupId ? (
        <div className="tmn-share-sheet__no-group">
          <p>This note isn&rsquo;t part of a group, so it can&rsquo;t be shared yet.</p>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      ) : (
        <>
          {/* Mode selector */}
          <div className="tmn-share-sheet__mode-selector">
            <SegmentedControl
              value={mode}
              onChange={(v) => setMode(v as ShareMode)}
              options={[
                { value: 'group', label: 'Whole group' },
                { value: 'members', label: 'Specific members' },
              ]}
            />
          </div>

          {/* Members picker (only in members mode) */}
          {mode === 'members' && (
            <div className="tmn-share-sheet__members-list" role="list" aria-label="Group members">
              {membersLoading ? (
                <div className="tmn-share-sheet__loading">
                  <Icon name="hourglass" size={18} />
                  <span>Loading members…</span>
                </div>
              ) : members.length === 0 ? (
                <p className="tmn-share-sheet__empty">No other members in this group.</p>
              ) : (
                members.map((m) => (
                  <div key={m.sub} className="tmn-share-sheet__member-row" role="listitem">
                    <Avatar name={m.name} size="sm" />
                    <span className="tmn-share-sheet__member-name">{m.name}</span>
                    <Checkbox
                      aria-label={`Share with ${m.name}`}
                      checked={selected.has(m.sub)}
                      onChange={() => toggleMember(m.sub)}
                    />
                  </div>
                ))
              )}
            </div>
          )}

          {/* Current shares */}
          <div className="tmn-share-sheet__section-label">Currently shared with</div>
          <div className="tmn-share-sheet__shares-list" aria-label="Current shares">
            {sharesLoading ? (
              <div className="tmn-share-sheet__loading">
                <Icon name="hourglass" size={18} />
                <span>Loading…</span>
              </div>
            ) : shares.length === 0 ? (
              <p className="tmn-share-sheet__empty">Not shared with anyone yet.</p>
            ) : (
              shares.map((s) => {
                const isConfirming = confirming.has(s.recipientSub);
                const isRevoking = revoking.has(s.recipientSub);
                const displayName = resolveRecipientName(s.recipientSub);
                return (
                  <div key={s.recipientSub} className="tmn-share-sheet__share-row">
                    <Avatar name={displayName} size="sm" />
                    <span className="tmn-share-sheet__share-name">{displayName}</span>
                    {isConfirming ? (
                      <div className="tmn-share-sheet__revoke-confirm">
                        <span className="tmn-share-sheet__revoke-label">Remove access?</span>
                        <button
                          type="button"
                          className="tmn-share-sheet__revoke-confirm-btn"
                          disabled={isRevoking}
                          onClick={() => void confirmRevoke(s.recipientSub)}
                        >
                          {isRevoking ? '…' : 'Confirm'}
                        </button>
                        <button
                          type="button"
                          className="tmn-share-sheet__revoke-cancel-btn"
                          onClick={() => cancelRevoke(s.recipientSub)}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="tmn-share-sheet__revoke-btn"
                        onClick={() => startRevoke(s.recipientSub)}
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Primary share action */}
          <div className="tmn-share-sheet__footer">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            <Button
              variant="primary"
              disabled={shareDisabled}
              onClick={() => void handleShare()}
            >
              Share
            </Button>
          </div>
        </>
      )}

      {/* Toast */}
      {toast && (
        <div className="tmn-share-sheet__toast">
          <Toast
            tone={toast.tone}
            icon={
              toast.tone === 'success' ? <Icon name="check" size={16} /> : undefined
            }
            title={toast.title}
            onClose={() => setToast(null)}
            duration={3200}
          />
        </div>
      )}
    </Dialog>
  );
}

ShareSheet.displayName = 'ShareSheet';
