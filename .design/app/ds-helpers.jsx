/* TransformMyNotes — shared helpers, frames, data, markdown.
   Exposes everything on window for the screen files + index to consume. */

const NS = window.TransformMyNotesDesignSystem_33c9b3;

/* ---------- Lucide icon as a real React SVG (survives re-render) ---------- */
const _camelKey = (k) => (k === 'class' ? 'className' : k.replace(/-([a-z])/g, (_, c) => c.toUpperCase()));
const _camelAttrs = (o) => { const r = {}; for (const k in o) r[_camelKey(k)] = o[k]; return r; };
const Ico = ({ n, size = 22, stroke = 2, color, style, ...p }) => {
  const lib = window.lucide && window.lucide.icons;
  const key = String(n).replace(/(^|-)([a-z0-9])/g, (_, __, c) => c.toUpperCase());
  const node = lib && lib[key];
  if (!node) return null;
  const attrs = _camelAttrs(node[1]), children = node[2] || [];
  return React.createElement('svg', {
    ...attrs, width: size, height: size, strokeWidth: stroke,
    style: { display: 'inline-flex', flex: 'none', color, ...(style || {}) }, ...p,
  }, children.map((c, i) => React.createElement(c[0], { key: i, ..._camelAttrs(c[1]) })));
};

/* ---------------------------------------------------------------- StatusBar */
function StatusBar({ dark = false, time = '9:41' }) {
  const col = dark ? '#fff' : 'var(--text-strong)';
  return (
    <div style={{
      height: 44, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 24px 0 28px', color: col, fontFamily: 'var(--font-sans)',
    }}>
      <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: '0.01em' }}>{time}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <svg width="18" height="12" viewBox="0 0 18 12" fill={col}><rect x="0" y="7" width="3" height="5" rx="1"/><rect x="5" y="4.5" width="3" height="7.5" rx="1"/><rect x="10" y="2" width="3" height="10" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1" opacity="0.4"/></svg>
        <svg width="16" height="12" viewBox="0 0 16 12" fill="none" stroke={col} strokeWidth="1.4"><path d="M1 4.2a10 10 0 0 1 14 0M3.4 6.8a6.4 6.4 0 0 1 9.2 0M5.8 9.3a2.9 2.9 0 0 1 4.4 0" strokeLinecap="round"/><circle cx="8" cy="11" r="0.6" fill={col}/></svg>
        <svg width="26" height="13" viewBox="0 0 26 13" fill="none"><rect x="0.6" y="0.6" width="21" height="11.8" rx="3" stroke={col} strokeOpacity="0.5"/><rect x="2.2" y="2.2" width="16" height="8.6" rx="1.6" fill={col}/><rect x="23" y="4" width="2" height="5" rx="1" fill={col} fillOpacity="0.5"/></svg>
      </div>
    </div>
  );
}

function HomeIndicator({ dark = false }) {
  return (
    <div style={{ height: 26, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 134, height: 5, borderRadius: 3, background: dark ? 'rgba(255,255,255,0.6)' : 'var(--stone-400)' }} />
    </div>
  );
}

/* --------------------------------------------------- PhoneScreen (frame) */
function PhoneScreen({ children, bg = 'var(--surface-app)', dark = false, time, statusBar = true, home = true, style }) {
  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      background: bg, fontFamily: 'var(--font-sans)', position: 'relative', overflow: 'hidden', ...style,
    }}>
      {statusBar && <StatusBar dark={dark} time={time} />}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {children}
      </div>
      {home && <HomeIndicator dark={dark} />}
    </div>
  );
}

/* ------------------------------------------------------- Bottom nav (app) */
function BottomNav({ active = 'library' }) {
  const items = [
    { id: 'library', icon: 'book-open', label: 'Library' },
    { id: 'search', icon: 'search', label: 'Search' },
    { id: 'review', icon: 'layers', label: 'Review' },
    { id: 'profile', icon: 'user', label: 'You' },
  ];
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-around', alignItems: 'center', padding: '10px 8px 6px',
      background: 'rgba(255,253,248,0.9)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
      borderTop: '1px solid var(--border-subtle)', flex: 'none',
    }}>
      {items.map((it) => {
        const on = it.id === active;
        return (
          <div key={it.id} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            color: on ? 'var(--brand-strong)' : 'var(--text-subtle)', padding: '4px 14px', cursor: 'pointer',
          }}>
            <Ico n={it.icon} size={23} stroke={on ? 2.4 : 2} />
            <span style={{ fontSize: 11, fontWeight: on ? 700 : 600 }}>{it.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------- faux handwriting */
const HAND_LINES = [
  'El subjuntivo — duda, deseo,', 'posibilidad.  3 patrones:', '-ar   -er   -ir',
  'que yo hable / coma / viva', 'ojalá que llueva  ☂', '* repasar para el examen *',
];
function HandNote({ tilt = 0, lines = HAND_LINES, style }) {
  return (
    <div style={{
      background: '#fffdf6', borderRadius: 14, padding: '24px 22px',
      boxShadow: 'var(--shadow-md)', transform: `rotate(${tilt}deg)`,
      backgroundImage: 'repeating-linear-gradient(transparent, transparent 33px, rgba(48,127,112,0.16) 33px, rgba(48,127,112,0.16) 34px)',
      lineHeight: '34px', width: '100%', boxSizing: 'border-box',
      borderLeft: '2px solid rgba(194,84,47,0.35)', ...style,
    }}>
      {lines.map((l, i) => (
        <div key={i} style={{
          fontFamily: 'var(--font-hand)', fontSize: 25, color: '#1f3a3a',
          transform: `rotate(${(i % 2 ? -0.5 : 0.6)}deg)`, whiteSpace: 'nowrap',
        }}>{l}</div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------- Markdown -> HTML */
function mdEscape(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function mdInline(s) {
  s = mdEscape(s);
  s = s.replace(/==(.+?)==/g, '<mark class="md-hl">$1</mark>');
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/`([^`]+?)`/g, '<code class="md-code">$1</code>');
  s = s.replace(/(^|[^*])\*([^*]+?)\*/g, '$1<em>$2</em>');
  return s;
}
function mdTable(rows) {
  const cells = (r) => r.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
  const head = cells(rows[0]);
  const body = rows.slice(2).map(cells);
  return '<table class="md-table"><thead><tr>' + head.map((c) => '<th>' + mdInline(c) + '</th>').join('') +
    '</tr></thead><tbody>' + body.map((r) => '<tr>' + r.map((c) => '<td>' + mdInline(c) + '</td>').join('') + '</tr>').join('') +
    '</tbody></table>';
}
function renderMarkdown(md) {
  const lines = (md || '').replace(/\r/g, '').split('\n');
  let html = '', i = 0;
  const isBlank = (l) => /^\s*$/.test(l);
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) { i++; continue; }
    if (/^\s*\|/.test(line)) { const t = []; while (i < lines.length && /^\s*\|/.test(lines[i])) { t.push(lines[i]); i++; } html += mdTable(t); continue; }
    let m = line.match(/^(#{1,3})\s+(.*)$/);
    if (m) { const lvl = m[1].length + 1; html += `<h${lvl}>` + mdInline(m[2]) + `</h${lvl}>`; i++; continue; }
    if (/^\s*---+\s*$/.test(line)) { html += '<hr/>'; i++; continue; }
    if (/^\s*>\s?/.test(line)) { const b = []; while (i < lines.length && /^\s*>\s?/.test(lines[i])) { b.push(lines[i].replace(/^\s*>\s?/, '')); i++; } html += '<blockquote>' + mdInline(b.join(' ')) + '</blockquote>'; continue; }
    if (/^\s*[-*]\s+/.test(line)) { const it = []; while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { it.push(lines[i].replace(/^\s*[-*]\s+/, '')); i++; } html += '<ul>' + it.map((x) => '<li>' + mdInline(x) + '</li>').join('') + '</ul>'; continue; }
    if (/^\s*\d+\.\s+/.test(line)) { const it = []; while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { it.push(lines[i].replace(/^\s*\d+\.\s+/, '')); i++; } html += '<ol>' + it.map((x) => '<li>' + mdInline(x) + '</li>').join('') + '</ol>'; continue; }
    const buf = [];
    while (i < lines.length && !isBlank(lines[i]) && !/^\s*[-*]\s+/.test(lines[i]) && !/^\s*\d+\.\s+/.test(lines[i]) &&
           !/^(#{1,3})\s+/.test(lines[i]) && !/^\s*\|/.test(lines[i]) && !/^\s*>\s?/.test(lines[i]) && !/^\s*---+\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
    html += '<p>' + mdInline(buf.join(' ')) + '</p>';
  }
  return html;
}

/* CSS for rendered markdown (injected once) */
if (!document.getElementById('tmn-md-css')) {
  const el = document.createElement('style');
  el.id = 'tmn-md-css';
  el.textContent = `
  .md-body { font-family: var(--font-serif); font-size: 17px; line-height: 1.72; color: var(--text-body); }
  .md-body h2 { font-family: var(--font-serif); font-size: 22px; font-weight: 600; color: var(--text-strong); letter-spacing: -0.01em; margin: 22px 0 8px; }
  .md-body h3 { font-family: var(--font-serif); font-size: 18.5px; font-weight: 600; color: var(--text-strong); margin: 18px 0 6px; }
  .md-body h4 { font-family: var(--font-sans); font-size: 13px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--brand-strong); margin: 18px 0 6px; }
  .md-body p { margin: 0 0 14px; }
  .md-body ul, .md-body ol { margin: 0 0 14px; padding-left: 22px; }
  .md-body li { margin: 0 0 6px; }
  .md-body strong { font-weight: 700; color: var(--text-strong); }
  .md-body em { font-style: italic; }
  .md-body .md-code { font-family: var(--font-mono); font-size: 0.86em; background: var(--surface-sunken); padding: 1px 6px; border-radius: 5px; color: var(--brand-strong); }
  .md-body .md-hl { background: var(--highlighter); padding: 0 3px; border-radius: 3px; color: inherit; box-decoration-break: clone; -webkit-box-decoration-break: clone; }
  .md-body blockquote { margin: 0 0 14px; padding: 4px 0 4px 16px; border-left: 3px solid var(--teal-300); color: var(--text-muted); font-style: italic; }
  .md-body hr { border: none; border-top: 1px solid var(--border-subtle); margin: 22px 0; }
  .md-body .md-table { width: 100%; border-collapse: collapse; margin: 4px 0 18px; font-family: var(--font-sans); font-size: 14.5px; }
  .md-body .md-table th { text-align: left; font-weight: 700; color: var(--brand-strong); padding: 8px 12px; border-bottom: 2px solid var(--border-default); background: var(--surface-brand-soft); }
  .md-body .md-table td { padding: 8px 12px; border-bottom: 1px solid var(--border-subtle); color: var(--text-body); }
  .md-body .md-table tr:last-child td { border-bottom: none; }
  .md-body .md-table td:first-child { font-family: var(--font-serif); font-weight: 600; color: var(--text-strong); }
  .tmn-scroll::-webkit-scrollbar { width: 0; height: 0; }
  .tmn-scroll { scrollbar-width: none; }
  `;
  document.head.appendChild(el);
}

/* ------------------------------------------------------------------- DATA */
const NOTES = [
  { id: 'n1', course: 'Spanish 201', title: 'The subjunctive mood',
    snippet: 'El <mark>subjuntivo</mark> expresses doubt, desire and possibility across three verb patterns.',
    tags: ['subjunctive', 'verbs'], highlights: 12, words: 1204, status: 'clean', when: 'Today · 2:14 PM' },
  { id: 'n2', course: 'Spanish 201', title: 'Ser vs. estar',
    snippet: 'Use <mark>ser</mark> for identity and essence; <mark>estar</mark> for state and location.',
    tags: ['grammar', 'B1'], highlights: 8, words: 642, status: 'clean', when: 'Yesterday' },
  { id: 'n3', course: 'Vocab journal', title: 'Market day words',
    snippet: 'la sandía, el aguacate, la calabaza — produce gathered from Saturday\u2019s notes.',
    tags: ['vocab', 'food'], highlights: 5, words: 318, status: 'original', when: 'Sat · 11:02 AM' },
  { id: 'n4', course: 'Spanish 201', title: 'Preterite vs. imperfect',
    snippet: 'The <mark>pretérito</mark> marks completed actions; the imperfect paints the background.',
    tags: ['past-tense', 'verbs'], highlights: 9, words: 880, status: 'clean', when: 'Thu' },
  { id: 'n5', course: 'Conversation', title: 'Por vs. para — quick rules',
    snippet: '<mark>Por</mark> for cause and exchange; <mark>para</mark> for purpose and destination.',
    tags: ['prepositions'], highlights: 6, words: 410, status: 'clean', when: 'Mon' },
];

const NOTE_MD = `## What is the subjunctive?

El ==subjuntivo== is a verb **mood** that expresses doubt, desire, emotion and possibility — not plain fact. It almost always lives in a subordinate clause introduced by *que*.

> Indicative states what *is*. Subjunctive colours what *might*, *should*, or *is wished* to be.

## The three regular patterns

Regular verbs swap their theme vowel. Learn the endings by infinitive group:

| Infinitive | yo form | Example |
| --- | --- | --- |
| hablar (-ar) | hable | que yo ==hable== |
| comer (-er) | coma | que yo ==coma== |
| vivir (-ir) | viva | que yo ==viva== |

## Common triggers

Memorise the phrases that *force* the subjunctive:

- **Wishes** — *querer que*, *ojalá que*
- **Doubt** — *dudar que*, *no creer que*
- **Emotion** — *me alegro de que*, *temer que*
- **Impersonal** — *es posible que*, *es importante que*

#### Watch out

When there is **no change of subject**, use the infinitive instead: *Quiero \`comer\`* — not *que yo coma*.`;

const PENDING = [
  { id: 'p1', name: 'Marco Bianchi', email: 'marco.bianchi@gmail.com', when: '6 minutes ago', code: 'SPAN-7K2Q', note: 'Joining Prof. Ruiz\u2019s Spanish 201 group.', lang: 'es \u2192 en' },
  { id: 'p2', name: 'Yuki Tanaka', email: 'yuki.tanaka@uni.edu', when: '1 hour ago', code: null, note: 'Self-registered, no invite code.', lang: 'ja \u2192 en' },
  { id: 'p3', name: 'Sofia Moreau', email: 'sofia.m@protonmail.com', when: 'Yesterday', code: 'FREN-3M9X', note: 'Invited by admin · French 110.', lang: 'fr \u2192 en' },
];

const USERS = [
  { id: 'u1', name: 'Ana Ruiz', email: 'ana.ruiz@gmail.com', role: 'Admin', status: 'active', notes: 48, joined: 'Jan 2026', you: true },
  { id: 'u2', name: 'Kenji Watanabe', email: 'kenji.w@uni.edu', role: 'Member', status: 'active', notes: 31, joined: 'Feb 2026' },
  { id: 'u3', name: 'Lucía Fernández', email: 'lucia.f@gmail.com', role: 'Member', status: 'active', notes: 22, joined: 'Feb 2026' },
  { id: 'u4', name: 'Tom Becker', email: 'tom.becker@outlook.com', role: 'Member', status: 'disabled', notes: 4, joined: 'Mar 2026' },
  { id: 'u5', name: 'Priya Nair', email: 'priya.nair@gmail.com', role: 'Member', status: 'active', notes: 17, joined: 'Apr 2026' },
];

const INVITES = [
  { id: 'i1', target: 'marco.bianchi@gmail.com', type: 'email', code: 'SPAN-7K2Q', status: 'pending', when: 'Sent 6 min ago', by: 'Ana Ruiz' },
  { id: 'i2', target: 'Open code', type: 'code', code: 'SPAN-201-FALL', status: 'used', when: '4 / 10 used', by: 'Ana Ruiz' },
  { id: 'i3', target: 'sofia.m@protonmail.com', type: 'email', code: 'FREN-3M9X', status: 'used', when: 'Joined yesterday', by: 'Ana Ruiz' },
  { id: 'i4', target: 'old.student@uni.edu', type: 'email', code: 'SPAN-1A0B', status: 'expired', when: 'Expired Apr 2', by: 'Ana Ruiz' },
  { id: 'i5', target: 'Open code', type: 'code', code: 'WINTER-2025', status: 'revoked', when: 'Revoked by you', by: 'Ana Ruiz' },
];

Object.assign(window, {
  TMN_NS: NS, Ico, StatusBar, HomeIndicator, PhoneScreen, BottomNav, HandNote,
  renderMarkdown, NOTES, NOTE_MD, PENDING, USERS, INVITES,
});
