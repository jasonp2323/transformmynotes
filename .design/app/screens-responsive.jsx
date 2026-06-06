/* TransformMyNotes — Responsive adaptations (tablet + desktop) */
const { Button: RBtn, Input: RInput, Badge: RBadge, Tag: RTag, Avatar: RAvatar,
  SegmentedControl: RSeg, HighlightText: RHL, IconButton: RIconBtn, NoteCard: RNoteCard, Card: RCard, Textarea: RTextarea } = window.TMN_NS;
const { Ico: RIco, HandNote: RHand, NOTES: RNOTES } = window;

/* ===================================================== NOTEBOOK — DESKTOP */
function NotebookDesktop({ isAdmin = true }) {
  const DesktopShell = window.DesktopShell;
  return (
    <DesktopShell active="library" isAdmin={isAdmin} title="Library"
      actions={<RBtn variant="primary" size="md" leftIcon={<RIco n="scan-line" size={17} />}>Capture note</RBtn>}>
      <div style={{ maxWidth: 1040, margin: '0 auto' }}>
        <p style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--text-muted)', margin: '0 0 20px' }}>
          Buenas tardes, Ana — <RHL variant="teal">9 cards</RHL> ready to review.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <RSeg defaultValue="all" options={[{ value: 'all', label: 'All notes' }, { value: 'review', label: 'Review' }, { value: 'shared', label: 'Shared' }]} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-sans)', fontSize: 13.5, color: 'var(--text-muted)' }}>
            <RIco n="arrow-up-down" size={16} /> Recent first
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {RNOTES.map((nt) => <RNoteCard key={nt.id} {...nt} onClick={() => {}} />)}
          <RCard variant="ghost" padded style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 168, gap: 10, cursor: 'pointer' }}>
            <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'var(--surface-brand-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <RIco n="plus" size={22} style={{ color: 'var(--brand-strong)' }} />
            </div>
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 600, color: 'var(--text-muted)' }}>New note</span>
          </RCard>
        </div>
      </div>
    </DesktopShell>
  );
}

/* ====================================================== NOTEBOOK — TABLET */
function NotebookTablet() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--surface-app)', fontFamily: 'var(--font-sans)' }}>
      <window.StatusBar />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 32px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="assets/logo-mark.svg" width="34" height="34" alt="" />
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: 24, fontWeight: 600, color: 'var(--text-strong)' }}>Library</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <RIconBtn label="Capture" variant="solid"><RIco n="scan-line" size={20} /></RIconBtn>
          <RAvatar name="Ana Ruiz" />
        </div>
      </div>
      <div className="tmn-scroll" style={{ flex: 1, overflow: 'auto', padding: '0 32px 32px' }}>
        <p style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--text-muted)', margin: '0 0 16px' }}>
          Buenas tardes, Ana — <RHL variant="teal">9 cards</RHL> ready to review.
        </p>
        <div style={{ display: 'flex', gap: 12, marginBottom: 18 }}>
          <div style={{ flex: 1 }}><RInput leadingIcon={<RIco n="search" size={18} />} placeholder="Search your notes" /></div>
          <RSeg defaultValue="all" options={[{ value: 'all', label: 'All' }, { value: 'review', label: 'Review' }, { value: 'shared', label: 'Shared' }]} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
          {RNOTES.map((nt) => <RNoteCard key={nt.id} {...nt} onClick={() => {}} />)}
        </div>
      </div>
      <window.HomeIndicator />
    </div>
  );
}

/* ============================================ TRANSCRIPTION — DESKTOP (side-by-side) */
const RCLEAN = `El subjuntivo is a verb mood that expresses doubt, desire, emotion and possibility — not plain fact. It appears in subordinate clauses introduced by que.

Regular verbs follow three patterns by ending: -ar → -e, -er / -ir → -a. So hablar becomes "que yo hable", and comer becomes "que yo coma".

Triggers worth memorising: ojalá que, es posible que, and verbs of wishing such as querer que.`;

function TranscriptionDesktop() {
  const DesktopShell = window.DesktopShell;
  const [text, setText] = React.useState(RCLEAN);
  return (
    <DesktopShell active="library" eyebrow="New note · Spanish 201" title="Review transcription"
      actions={<div style={{ display: 'flex', gap: 10 }}><RBtn variant="ghost" size="md">Discard</RBtn><RBtn variant="primary" size="md" leftIcon={<RIco n="check" size={17} />}>Save to notebook</RBtn></div>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start', maxWidth: 1100, margin: '0 auto' }}>
        {/* Original */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-subtle)' }}>Original</span>
            <RBadge tone="warning" dot>2 words to check</RBadge>
          </div>
          <RCard padded style={{ background: '#fffdf6' }}>
            <RHand tilt={0} style={{ boxShadow: 'none', borderRadius: 8 }} />
          </RCard>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-subtle)' }}>
            <RBadge tone="neutral">IMG_4821.jpg</RBadge><span style={{ alignSelf: 'center' }}>es → en · captured 2:14 PM</span>
          </div>
        </div>
        {/* Clean editable */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--brand-strong)' }}>Clean — editable</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-subtle)' }}>OCR 98% · 1,204 words</span>
          </div>
          <RInput defaultValue="The subjunctive mood" style={{ fontFamily: 'var(--font-serif)', fontSize: 18, fontWeight: 600 }} />
          <div style={{ marginTop: 14 }}>
            <RTextarea ruled value={text} onChange={(e) => setText(e.target.value)} rows={12} style={{ minHeight: 320 }} />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14, alignItems: 'center' }}>
            <RTag hash tone="brand">subjunctive</RTag><RTag hash tone="brand">verbs</RTag><RTag hash onClick={() => {}}>+ add tag</RTag>
            <div style={{ flex: 1 }} />
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--text-muted)' }}>
              <RIco n="info" size={14} style={{ color: 'var(--warning)' }} /> Underlined words are low-confidence reads
            </span>
          </div>
        </div>
      </div>
    </DesktopShell>
  );
}

Object.assign(window, { NotebookDesktop, NotebookTablet, TranscriptionDesktop });
