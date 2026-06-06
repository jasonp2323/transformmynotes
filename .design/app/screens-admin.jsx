/* TransformMyNotes — Admin panel (desktop) + shared DesktopShell */
const { Button: ABtn, Input: AInput, Badge: ABadge, Tag: ATag, Avatar: AAvatar, Select: ASelect,
  Switch: ASwitch, SegmentedControl: ASeg, IconButton: AIconBtn, Card: ACard, Toast: AToast, Dialog: ADialog } = window.TMN_NS;
const { Ico: AIco } = window;
/* PENDING, USERS, INVITES are global from ds-helpers */

/* ============================================================ DesktopShell */
function DesktopShell({ active = 'library', title, eyebrow, actions, children, isAdmin = true, search = 'Search your notes' }) {
  const nav = [
    { group: 'Notebook', items: [
      { id: 'library', icon: 'book-open', label: 'Library' },
      { id: 'search', icon: 'search', label: 'Search' },
      { id: 'review', icon: 'layers', label: 'Review deck', count: 9 },
    ] },
  ];
  if (isAdmin) nav.push({ group: 'Admin', items: [
    { id: 'pending', icon: 'user-plus', label: 'Pending', count: 3, accent: true },
    { id: 'members', icon: 'users', label: 'Members' },
    { id: 'invites', icon: 'ticket', label: 'Invites' },
  ] });

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--surface-app)', fontFamily: 'var(--font-sans)' }}>
      {/* sidebar */}
      <aside style={{ width: 248, flex: 'none', background: 'var(--surface-card)', borderRight: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', padding: '22px 16px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 8px 22px' }}>
          <img src="assets/logo-mark.svg" width="30" height="30" alt="" />
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: 17.5, fontWeight: 600, color: 'var(--text-strong)', letterSpacing: '-0.01em' }}>TransformMyNotes</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, flex: 1 }}>
          {nav.map((g) => (
            <div key={g.group}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--text-subtle)', padding: '0 10px 8px' }}>{g.group}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {g.items.map((it) => {
                  const on = it.id === active;
                  return (
                    <div key={it.id} style={{
                      display: 'flex', alignItems: 'center', gap: 11, padding: '9px 11px', borderRadius: 10, cursor: 'pointer',
                      background: on ? 'var(--surface-brand-soft)' : 'transparent', color: on ? 'var(--brand-strong)' : 'var(--text-muted)',
                      fontWeight: on ? 700 : 600, fontSize: 14.5,
                    }}>
                      <AIco n={it.icon} size={19} stroke={on ? 2.3 : 2} />
                      <span style={{ flex: 1 }}>{it.label}</span>
                      {it.count != null && (
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
                          background: it.accent ? 'var(--accent)' : on ? 'var(--teal-100)' : 'var(--surface-sunken)',
                          color: it.accent ? 'var(--on-accent)' : on ? 'var(--brand-strong)' : 'var(--text-subtle)' }}>{it.count}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px', borderTop: '1px solid var(--border-subtle)', marginTop: 8 }}>
          <AAvatar name="Ana Ruiz" size="sm" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-strong)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Ana Ruiz</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-subtle)' }}>{isAdmin ? 'Admin' : 'Member'}</div>
          </div>
          <AIco n="settings" size={17} style={{ color: 'var(--text-subtle)' }} />
        </div>
      </aside>

      {/* main */}
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <header style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 18, padding: '20px 32px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {eyebrow && <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-subtle)', marginBottom: 3 }}>{eyebrow}</div>}
            <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 25, fontWeight: 600, color: 'var(--text-strong)', margin: 0, letterSpacing: '-0.01em' }}>{title}</h1>
          </div>
          <div style={{ width: 260, flex: 'none' }}>
            <AInput leadingIcon={<AIco n="search" size={17} />} placeholder={search} />
          </div>
          {actions}
        </header>
        <div className="tmn-scroll" style={{ flex: 1, overflow: 'auto', padding: '28px 32px 40px' }}>{children}</div>
      </main>
    </div>
  );
}

/* status pill helper for invites/users */
const STATUS_TONE = { pending: 'warning', used: 'success', expired: 'neutral', revoked: 'danger', active: 'success', disabled: 'neutral' };

/* ============================================================ PENDING QUEUE */
function AdminPending() {
  const [rows, setRows] = React.useState(PENDING);
  const [toast, setToast] = React.useState(null);
  const act = (id, kind) => {
    const p = rows.find((r) => r.id === id);
    setRows((rs) => rs.filter((r) => r.id !== id));
    setToast({ kind, name: p.name.split(' ')[0] });
    setTimeout(() => setToast(null), 3200);
  };
  return (
    <DesktopShell active="pending" eyebrow="Admin" title="Pending registrations"
      actions={<ABtn variant="secondary" size="md" leftIcon={<AIco n="check-check" size={17} />}>Approve all</ABtn>}>
      <div style={{ display: 'flex', gap: 14, marginBottom: 22 }}>
        {[['Awaiting review', rows.length, 'var(--warning-500)'], ['Approved today', 5, 'var(--success-500)'], ['Avg. wait', '4h', 'var(--brand-strong)']].map(([l, v, c], i) => (
          <ACard key={i} padded style={{ flex: 1 }}>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 600 }}>{l}</div>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 30, fontWeight: 600, color: c, marginTop: 4 }}>{v}</div>
          </ACard>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyPanel icon="inbox" title="You're all caught up" sub="No registrations are waiting for review." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rows.map((p) => (
            <ACard key={p.id} padded>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <AAvatar name={p.name} size="lg" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'var(--font-serif)', fontSize: 18, fontWeight: 600, color: 'var(--text-strong)' }}>{p.name}</span>
                    {p.code ? <ABadge tone="brand">{p.code}</ABadge> : <ABadge tone="warning" dot>No invite code</ABadge>}
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-subtle)' }}>{p.lang}</span>
                  </div>
                  <div style={{ fontSize: 13.5, color: 'var(--text-muted)', marginTop: 3 }}>{p.email} · requested {p.when}</div>
                  <div style={{ fontSize: 13.5, color: 'var(--text-body)', marginTop: 6, fontStyle: 'italic' }}>&ldquo;{p.note}&rdquo;</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
                  <ABtn variant="ghost" size="md" onClick={() => act(p.id, 'reject')}>Reject</ABtn>
                  <ABtn variant="primary" size="md" leftIcon={<AIco n="check" size={16} />} onClick={() => act(p.id, 'approve')}>Approve</ABtn>
                </div>
              </div>
            </ACard>
          ))}
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', right: 28, bottom: 28, width: 340, zIndex: 50 }}>
          <AToast tone={toast.kind === 'approve' ? 'success' : 'neutral'} icon={<AIco n={toast.kind === 'approve' ? 'check-circle-2' : 'user-x'} size={20} />}
            title={toast.kind === 'approve' ? `${toast.name} approved` : `${toast.name}'s request declined`} onClose={() => setToast(null)}>
            {toast.kind === 'approve' ? 'They can sign in now — we sent the welcome email.' : 'They\u2019ve been notified by email.'}
          </AToast>
        </div>
      )}
    </DesktopShell>
  );
}

/* ============================================================ USER MGMT */
function AdminUsers() {
  const [users, setUsers] = React.useState(USERS);
  const [confirm, setConfirm] = React.useState(null);
  const setRole = (id, role) => setUsers((us) => us.map((u) => (u.id === id ? { ...u, role } : u)));
  const toggle = (id) => setUsers((us) => us.map((u) => (u.id === id ? { ...u, status: u.status === 'active' ? 'disabled' : 'active' } : u)));
  const remove = (id) => { setUsers((us) => us.filter((u) => u.id !== id)); setConfirm(null); };

  const cols = '2.4fr 1.1fr 0.9fr 0.7fr 0.5fr';
  return (
    <DesktopShell active="members" eyebrow="Admin" title="Members" search="Search members"
      actions={<ABtn variant="primary" size="md" leftIcon={<AIco n="user-plus" size={17} />}>Invite member</ABtn>}>
      <ACard padded={false}>
        <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 12, padding: '14px 22px', borderBottom: '1px solid var(--border-subtle)', fontSize: 11.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-subtle)' }}>
          <span>Member</span><span>Role</span><span>Status</span><span>Notes</span><span style={{ textAlign: 'right' }}>Manage</span>
        </div>
        {users.map((u, idx) => (
          <div key={u.id} style={{ display: 'grid', gridTemplateColumns: cols, gap: 12, padding: '14px 22px', alignItems: 'center',
            borderBottom: idx < users.length - 1 ? '1px solid var(--border-subtle)' : 'none', opacity: u.status === 'disabled' ? 0.62 : 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <AAvatar name={u.name} size="md" />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--text-strong)', display: 'flex', alignItems: 'center', gap: 7 }}>
                  {u.name} {u.you && <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-subtle)' }}>(you)</span>}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-subtle)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.email}</div>
              </div>
            </div>
            <div>
              <ASelect value={u.role} onChange={(e) => setRole(u.id, e.target.value)} options={['Admin', 'Member']} />
            </div>
            <div><ABadge tone={STATUS_TONE[u.status]} dot>{u.status === 'active' ? 'Active' : 'Disabled'}</ABadge></div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-muted)' }}>{u.notes}</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
              <AIconBtn label={u.status === 'active' ? 'Disable' : 'Enable'} variant="plain" size="sm" onClick={() => toggle(u.id)}>
                <AIco n={u.status === 'active' ? 'ban' : 'circle-check'} size={18} />
              </AIconBtn>
              <AIconBtn label="Remove" variant="plain" size="sm" onClick={() => setConfirm(u)} disabled={u.you}>
                <AIco n="trash-2" size={17} style={{ color: u.you ? 'var(--text-subtle)' : 'var(--danger-500)' }} />
              </AIconBtn>
            </div>
          </div>
        ))}
      </ACard>

      <ADialog open={!!confirm} onClose={() => setConfirm(null)} title="Remove member?"
        description={confirm ? `${confirm.name} will lose access and their ${confirm.notes} notes will be archived. This can\u2019t be undone.` : ''}
        footer={<><ABtn variant="ghost" onClick={() => setConfirm(null)}>Cancel</ABtn><ABtn variant="danger" onClick={() => remove(confirm.id)}>Remove member</ABtn></>} />
    </DesktopShell>
  );
}

/* ============================================================ INVITE MGMT */
function AdminInvites() {
  const [invites, setInvites] = React.useState(INVITES);
  const [mode, setMode] = React.useState('email');
  const revoke = (id) => setInvites((iv) => iv.map((i) => (i.id === id ? { ...i, status: 'revoked', when: 'Revoked just now' } : i)));
  const cols = '1.8fr 1.2fr 0.9fr 1.1fr 0.6fr';
  return (
    <DesktopShell active="invites" eyebrow="Admin" title="Invites" search="Search invites">
      {/* create */}
      <ACard padded style={{ marginBottom: 22 }} accentBar>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, fontWeight: 600, color: 'var(--text-strong)' }}>Create an invite</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>Email a single person, or share a reusable code.</div>
          </div>
          <ASeg value={mode} onChange={setMode}
            options={[{ value: 'email', label: 'Email invite', icon: <AIco n="mail" size={15} /> }, { value: 'code', label: 'Shareable code', icon: <AIco n="ticket" size={15} /> }]} />
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
          {mode === 'email' ? (
            <div style={{ flex: 1 }}><AInput label="Recipient email" placeholder="name@email.com" leadingIcon={<AIco n="mail" size={17} />} /></div>
          ) : (
            <div style={{ flex: 1 }}><AInput label="Code label" placeholder="e.g. SPAN-201-FALL" leadingIcon={<AIco n="ticket" size={17} />} /></div>
          )}
          <div style={{ width: 170 }}><ASelect label="Joins group" options={['Spanish 201', 'French 110', 'Conversation', 'No group']} /></div>
          <div style={{ width: 150 }}><ASelect label="Expires" options={['In 7 days', 'In 30 days', 'Never']} /></div>
          <ABtn variant="primary" size="md" leftIcon={<AIco n="send" size={16} />}>{mode === 'email' ? 'Send invite' : 'Create code'}</ABtn>
        </div>
      </ACard>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 2px 12px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-subtle)' }}>All invites</div>
        <ASeg defaultValue="all" options={[{ value: 'all', label: 'All' }, { value: 'pending', label: 'Pending' }, { value: 'used', label: 'Used' }]} />
      </div>

      <ACard padded={false}>
        <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 12, padding: '13px 22px', borderBottom: '1px solid var(--border-subtle)', fontSize: 11.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-subtle)' }}>
          <span>Recipient</span><span>Code</span><span>Status</span><span>Detail</span><span style={{ textAlign: 'right' }}></span>
        </div>
        {invites.map((iv, idx) => (
          <div key={iv.id} style={{ display: 'grid', gridTemplateColumns: cols, gap: 12, padding: '14px 22px', alignItems: 'center',
            borderBottom: idx < invites.length - 1 ? '1px solid var(--border-subtle)' : 'none', opacity: ['expired', 'revoked'].includes(iv.status) ? 0.6 : 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, flex: 'none', background: 'var(--surface-sunken)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <AIco n={iv.type === 'email' ? 'mail' : 'ticket'} size={17} style={{ color: 'var(--text-muted)' }} />
              </div>
              <span style={{ fontSize: 14, color: 'var(--text-strong)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{iv.target}</span>
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--brand-strong)', fontWeight: 600 }}>{iv.code}</span>
            <div><ABadge tone={STATUS_TONE[iv.status]} dot>{iv.status[0].toUpperCase() + iv.status.slice(1)}</ABadge></div>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{iv.when}</span>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
              {['pending', 'used'].includes(iv.status) ? (
                <ABtn variant="ghost" size="sm" onClick={() => revoke(iv.id)}>Revoke</ABtn>
              ) : (
                <AIconBtn label="Copy" variant="plain" size="sm"><AIco n="copy" size={16} /></AIconBtn>
              )}
            </div>
          </div>
        ))}
      </ACard>
    </DesktopShell>
  );
}

function EmptyPanel({ icon, title, sub }) {
  return (
    <ACard padded style={{ padding: '56px 24px', textAlign: 'center' }}>
      <div style={{ width: 64, height: 64, borderRadius: 18, background: 'var(--surface-brand-soft)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
        <AIco n={icon} size={28} style={{ color: 'var(--brand-strong)' }} />
      </div>
      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 600, color: 'var(--text-strong)', marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 14.5, color: 'var(--text-muted)' }}>{sub}</div>
    </ACard>
  );
}

Object.assign(window, { DesktopShell, AdminPending, AdminUsers, AdminInvites });
