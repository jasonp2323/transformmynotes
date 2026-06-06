/* TransformMyNotes — Core notebook screens */
const { Button: NBtn, Input: NInput, Badge: NBadge, Tag: NTag, Avatar: NAvatar,
  SegmentedControl: NSeg, HighlightText: NHL, IconButton: NIconBtn, NoteCard: NNoteCard, Card: NCard, Textarea: NTextarea, Toast: NToast } = window.TMN_NS;
const { Ico: NIco, PhoneScreen: NPhone, BottomNav: NNav, HandNote: NHand, renderMarkdown: NRender, NOTES: NNOTES, NOTE_MD: NMD } = window;

/* ------------------------------------------------------------- App header */
function AppHeader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 20px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <img src="assets/logo-mark.svg" width="32" height="32" alt="" />
        <span style={{ fontFamily: 'var(--font-serif)', fontSize: 22, fontWeight: 600, color: 'var(--text-strong)' }}>Library</span>
      </div>
      <NAvatar name="Ana Ruiz" />
    </div>
  );
}

/* ===================================================== NOTEBOOK HOME */
function NotebookHome() {
  const [tab, setTab] = React.useState('all');
  return (
    <NPhone>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div className="tmn-scroll" style={{ flex: 1, overflow: 'auto', padding: '4px 20px 92px' }}>
          <AppHeader />
          <p style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--text-muted)', margin: '0 0 16px', padding: '0 0 0 2px' }}>
            Buenas tardes, Ana — <NHL variant="teal">9 cards</NHL> ready to review.
          </p>
          <NInput leadingIcon={<NIco n="search" size={18} />} placeholder="Search your notes" />
          <div style={{ margin: '16px 0 18px' }}>
            <NSeg value={tab} onChange={setTab}
              options={[{ value: 'all', label: 'All' }, { value: 'review', label: 'Review' }, { value: 'shared', label: 'Shared' }]} />
          </div>
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-subtle)', margin: '0 0 12px' }}>Recent</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {NNOTES.slice(0, 4).map((nt) => <NNoteCard key={nt.id} {...nt} onClick={() => {}} />)}
          </div>
        </div>

        <button aria-label="Capture note" style={{
          position: 'absolute', right: 20, bottom: 86, width: 60, height: 60, borderRadius: '50%', border: 'none', cursor: 'pointer',
          background: 'var(--gradient-transform)', boxShadow: '0 10px 26px rgba(48,127,112,0.4)', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5,
        }}><NIco n="scan-line" size={26} /></button>

        <NNav active="library" />
      </div>
    </NPhone>
  );
}

/* ===================================================== NOTEBOOK EMPTY */
function NotebookEmpty() {
  return (
    <NPhone>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '4px 20px 0' }}>
          <AppHeader />
          <NInput leadingIcon={<NIco n="search" size={18} />} placeholder="Search your notes" />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 14px 60px' }}>
            <div style={{ position: 'relative', marginBottom: 24 }}>
              <NHand tilt={-4} lines={['mis apuntes…', 'por transformar', '— ✎ —']} style={{ width: 168, padding: '18px 16px', opacity: 0.96 }} />
              <div style={{ position: 'absolute', right: -14, bottom: -12, width: 44, height: 44, borderRadius: '50%', background: 'var(--gradient-transform)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-brand)' }}>
                <NIco n="sparkles" size={20} style={{ color: '#fff' }} />
              </div>
            </div>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 24, fontWeight: 600, color: 'var(--text-strong)', margin: '0 0 8px' }}>Your notebook is empty</h2>
            <p style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--text-muted)', margin: '0 0 24px', lineHeight: 1.6, maxWidth: 280 }}>
              Photograph a handwritten page and we&rsquo;ll turn it into a clean, searchable note.
            </p>
            <NBtn variant="primary" size="lg" leftIcon={<NIco n="scan-line" size={19} />}>Capture your first note</NBtn>
            <button style={{ marginTop: 14, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-link)', fontFamily: 'var(--font-sans)', fontSize: 14.5, fontWeight: 600 }}>
              or upload an image
            </button>
          </div>
        </div>
        <NNav active="library" />
      </div>
    </NPhone>
  );
}

/* ===================================================== CAPTURE */
function Capture() {
  return (
    <NPhone dark statusBar={false} home={false} bg="#0a2023">
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'radial-gradient(120% 90% at 50% 0%, #16414a 0%, #0e2b2f 60%, #0a2023 100%)' }}>
        <div style={{ paddingTop: 8 }}><window.StatusBar dark /></div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 20px 10px', color: '#fff', flex: 'none' }}>
          <CircBtn icon="x" />
          <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 15 }}>Capture note</span>
          <CircBtn icon="zap" />
        </div>

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px 34px', position: 'relative' }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <NHand tilt={-1.5} />
            {[0, 1, 2, 3].map((c) => (
              <span key={c} style={{
                position: 'absolute', width: 28, height: 28, borderColor: 'var(--gold-400)', borderStyle: 'solid',
                borderWidth: c < 2 ? '3px 0 0 0' : '0 0 3px 0', borderLeftWidth: c % 2 === 0 ? 3 : 0, borderRightWidth: c % 2 === 1 ? 3 : 0,
                top: c < 2 ? -12 : 'auto', bottom: c >= 2 ? -12 : 'auto', left: c % 2 === 0 ? -12 : 'auto', right: c % 2 === 1 ? -12 : 'auto',
                borderRadius: c === 0 ? '7px 0 0 0' : c === 1 ? '0 7px 0 0' : c === 2 ? '0 0 0 7px' : '0 0 7px 0',
              }} />
            ))}
            <div style={{ position: 'absolute', top: 12, right: 12 }}><NBadge tone="success" dot>Edges detected</NBadge></div>
          </div>
        </div>

        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.82)', fontFamily: 'var(--font-sans)', fontSize: 13.5, paddingBottom: 6 }}>
          Hold steady — keep the whole page in frame.
        </div>

        <div style={{ flex: 'none', padding: '14px 30px 30px', color: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
              <NIco n="image" size={26} /><span style={{ fontSize: 11 }}>Upload</span>
            </div>
            <button aria-label="Shutter" style={{ width: 74, height: 74, borderRadius: '50%', border: '4px solid rgba(255,255,255,0.85)', background: '#fff', cursor: 'pointer', boxShadow: '0 0 0 3px rgba(255,255,255,0.22)' }} />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
              <NIco n="rotate-ccw" size={26} /><span style={{ fontSize: 11 }}>Flip</span>
            </div>
          </div>
        </div>
        <window.HomeIndicator dark />
      </div>
    </NPhone>
  );
}
const CircBtn = ({ icon }) => (
  <button aria-label={icon} style={{ border: 'none', background: 'rgba(255,255,255,0.14)', width: 38, height: 38, borderRadius: '50%', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <NIco n={icon} size={icon === 'x' ? 20 : 18} />
  </button>
);

/* ============================================ TRANSCRIPTION — A · stacked */
const CLEAN_TEXT = `El subjuntivo is a verb mood that expresses doubt, desire, emotion and possibility — not plain fact. It appears in subordinate clauses introduced by que.

Regular verbs follow three patterns by ending: -ar → -e, -er / -ir → -a. So hablar becomes "que yo hable", and comer becomes "que yo coma".

Triggers worth memorising: ojalá que, es posible que, and verbs of wishing such as querer que.`;

function TranscriptionStacked() {
  const [text, setText] = React.useState(CLEAN_TEXT);
  return (
    <NPhone>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ flex: 'none', padding: '6px 14px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)' }}>
          <NIconBtn label="Back" variant="plain"><NIco n="chevron-left" size={24} /></NIconBtn>
          <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 16, color: 'var(--text-strong)' }}>Review transcription</span>
          <NIconBtn label="More" variant="plain"><NIco n="more-horizontal" size={22} /></NIconBtn>
        </div>

        <div className="tmn-scroll" style={{ flex: 1, overflow: 'auto', padding: '16px 18px 100px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-subtle)' }}>Original</span>
            <NBadge tone="warning" dot>2 words to check</NBadge>
          </div>
          <NHand tilt={0} style={{ marginBottom: 22 }} />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--brand-strong)' }}>Clean — editable</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-subtle)' }}>es → en · OCR 98%</span>
          </div>
          <NTextarea ruled value={text} onChange={(e) => setText(e.target.value)} rows={9} style={{ minHeight: 230 }} />
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--text-muted)', margin: '8px 2px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
            <NIco n="info" size={14} style={{ color: 'var(--warning)' }} /> Tap any <span style={{ borderBottom: '2px dotted var(--warning)' }}>underlined</span> word to fix a low-confidence read.
          </p>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 18 }}>
            <NTag hash tone="brand">subjunctive</NTag><NTag hash tone="brand">verbs</NTag>
            <NTag hash onClick={() => {}}>+ add tag</NTag>
          </div>
        </div>

        <ActionBar>
          <NIconBtn label="Discard" variant="soft"><NIco n="trash-2" size={19} /></NIconBtn>
          <NBtn variant="primary" fullWidth leftIcon={<NIco n="check" size={18} />}>Save to notebook</NBtn>
        </ActionBar>
      </div>
    </NPhone>
  );
}

/* ===================================== TRANSCRIPTION — B · segmented swap */
function TranscriptionSegmented() {
  const [view, setView] = React.useState('clean');
  const [text, setText] = React.useState(CLEAN_TEXT);
  return (
    <NPhone>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ flex: 'none', padding: '6px 14px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)' }}>
          <NIconBtn label="Back" variant="plain"><NIco n="chevron-left" size={24} /></NIconBtn>
          <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 16, color: 'var(--text-strong)' }}>New note</span>
          <NBadge tone="brand">Spanish 201</NBadge>
        </div>

        <div className="tmn-scroll" style={{ flex: 1, overflow: 'auto', padding: '16px 18px 100px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <NSeg value={view} onChange={setView}
              options={[{ value: 'original', label: 'Original', icon: <NIco n="scan-line" size={15} /> }, { value: 'clean', label: 'Clean', icon: <NIco n="sparkles" size={15} /> }]} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 10, fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-subtle)', gap: 12 }}>
            <span>es → en</span><span>1,204 words</span><span>OCR 98%</span>
          </div>

          {view === 'original' ? (
            <NHand tilt={0} />
          ) : (
            <NTextarea ruled value={text} onChange={(e) => setText(e.target.value)} rows={11} style={{ minHeight: 300 }} />
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 18 }}>
            <NTag hash tone="brand">subjunctive</NTag><NTag hash tone="brand">verbs</NTag><NTag hash onClick={() => {}}>+ add tag</NTag>
          </div>
        </div>

        <ActionBar>
          <NIconBtn label="Highlight" variant="soft"><NIco n="highlighter" size={19} /></NIconBtn>
          <NBtn variant="primary" fullWidth leftIcon={<NIco n="check" size={18} />}>Save to notebook</NBtn>
        </ActionBar>
      </div>
    </NPhone>
  );
}

/* ===================================================== NOTE VIEW + EDIT */
function NoteView() {
  const [view, setView] = React.useState('clean');
  const [editing, setEditing] = React.useState(false);
  const [md, setMd] = React.useState(NMD);
  const [reviewed, setReviewed] = React.useState(false);
  return (
    <NPhone bg="var(--surface-card)">
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ flex: 'none', padding: '6px 12px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)' }}>
          <NIconBtn label="Back" variant="plain"><NIco n="chevron-left" size={24} /></NIconBtn>
          <NBadge tone="brand">Spanish 201</NBadge>
          <NIconBtn label={editing ? 'Done' : 'Edit'} variant={editing ? 'soft' : 'plain'} onClick={() => setEditing((e) => !e)}>
            <NIco n={editing ? 'check' : 'pencil'} size={editing ? 20 : 19} />
          </NIconBtn>
        </div>

        <div className="tmn-scroll" style={{ flex: 1, overflow: 'auto', padding: '18px 22px 104px' }}>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 28, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.2, color: 'var(--text-strong)', margin: '0 0 10px' }}>The subjunctive mood</h1>
          <div style={{ display: 'flex', gap: 14, fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-subtle)', marginBottom: 16 }}>
            <span>es → en</span><span>1,204 words</span><span>OCR 98%</span>
          </div>

          {!editing && (
            <div style={{ marginBottom: 20 }}>
              <NSeg value={view} onChange={setView} options={[{ value: 'original', label: 'Original' }, { value: 'clean', label: 'Clean' }]} />
            </div>
          )}

          {editing ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-subtle)', marginBottom: 8 }}>
                <NIco n="code" size={14} /> Markdown · ** bold **, ## heading, == highlight ==
              </div>
              <NTextarea value={md} onChange={(e) => setMd(e.target.value)} rows={16} style={{ fontFamily: 'var(--font-mono)', fontSize: 13.5, lineHeight: 1.6, minHeight: 380 }} />
            </div>
          ) : view === 'clean' ? (
            <div className="md-body" dangerouslySetInnerHTML={{ __html: NRender(md) }} />
          ) : (
            <NHand tilt={0} />
          )}

          {!editing && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 22 }}>
              <NTag hash tone="brand">subjunctive</NTag><NTag hash tone="brand">verbs</NTag>
            </div>
          )}
        </div>

        {!editing && (
          <ActionBar>
            <NIconBtn label="Highlight" variant="soft"><NIco n="highlighter" size={19} /></NIconBtn>
            <NIconBtn label="Translate" variant="soft"><NIco n="languages" size={19} /></NIconBtn>
            <NBtn variant={reviewed ? 'secondary' : 'primary'} fullWidth leftIcon={<NIco n={reviewed ? 'check' : 'layers'} size={18} />} onClick={() => setReviewed(true)}>
              {reviewed ? 'Added to review' : 'Add to review deck'}
            </NBtn>
          </ActionBar>
        )}
      </div>
    </NPhone>
  );
}

/* floating bottom action bar */
function ActionBar({ children }) {
  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, bottom: 0, padding: '12px 18px 26px',
      background: 'rgba(255,253,248,0.92)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
      borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 10, zIndex: 6,
    }}>{children}</div>
  );
}

Object.assign(window, { NotebookHome, NotebookEmpty, Capture, TranscriptionStacked, TranscriptionSegmented, NoteView, AppHeader, ActionBar });
