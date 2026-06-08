/* TransformMyNotes — public landing page
   Composes the design-system components from window.NS. Mounted into #root.
   No login, no forms — a calm front door with two actions throughout. */

const NS = window.TransformMyNotesDesignSystem_33c9b3;
const { Button, IconButton, Badge, Tag, SegmentedControl, HighlightText } = NS;

const SIGNUP = 'https://app.transformmynotes.com/signup';
const LOGIN = 'https://app.transformmynotes.com/login';

/* ---- Lucide icon helper (renders real React SVG, survives re-render) ---- */
const Ico = ({ n, size = 22, stroke = 2, style, ...p }) => {
  const lib = window.lucide && window.lucide.icons;
  const key = String(n).replace(/(^|-)([a-z0-9])/g, (_, __, c) => c.toUpperCase());
  const node = lib && lib[key];
  if (!node) return null;
  const raw = node[1], children = node[2] || [];
  // lucide attrs use kebab-case (stroke-width, stroke-linecap…); React wants camelCase
  const attrs = {};
  for (const k in raw) {
    const ck = k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    attrs[ck] = raw[k];
  }
  return React.createElement('svg', {
    ...attrs, width: size, height: size, strokeWidth: stroke,
    style: { display: 'inline-flex', flex: 'none', ...(style || {}) }, ...p,
  }, children.map((c, i) => {
    const ca = {};
    for (const k in c[1]) ca[k.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase())] = c[1][k];
    return React.createElement(c[0], { key: i, ...ca });
  }));
};

/* reveal-on-scroll hook ------------------------------------------------- */
function useReveal() {
  React.useEffect(() => {
    const els = document.querySelectorAll('[data-reveal]');
    if (!('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('is-in'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.16, rootMargin: '0px 0px -8% 0px' });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

/* ============================================================ Header */
function Header() {
  const [menu, setMenu] = React.useState(false);
  React.useEffect(() => {
    if (!menu) return;
    const close = (e) => { if (!e.target.closest('.site-header')) setMenu(false); };
    const esc = (e) => { if (e.key === 'Escape') setMenu(false); };
    document.addEventListener('click', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('click', close); document.removeEventListener('keydown', esc); };
  }, [menu]);

  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <a className="brand-lockup" href="#top" aria-label="TransformMyNotes home">
          <img src="assets/logo-wordmark.svg" alt="TransformMyNotes" />
        </a>
        <div className="header-actions">
          <Button as="a" href={LOGIN} variant="ghost" size="sm" className="header-actions__signin">Sign in</Button>
          <Button as="a" href={SIGNUP} variant="primary" size="sm">Request access</Button>
          <IconButton
            className="header-actions__menu-btn"
            label={menu ? 'Close menu' : 'Open menu'}
            size="sm"
            aria-expanded={menu}
            onClick={(e) => { e.stopPropagation(); setMenu((v) => !v); }}
          >
            <Ico n={menu ? 'x' : 'menu'} size={20} />
          </IconButton>
        </div>
        {menu ? (
          <div className="mobile-menu" role="menu">
            <Button as="a" href={SIGNUP} variant="primary" size="md" fullWidth>Request access</Button>
            <Button as="a" href={LOGIN} variant="secondary" size="md" fullWidth>Sign in</Button>
          </div>
        ) : null}
      </div>
    </header>
  );
}

/* ============================================================ Hero visual */
const HAND_LINES = [
  'El subjuntivo — duda,',
  'deseo, posibilidad.',
  'que yo hable / coma / viva',
  'ojalá que llueva ☂',
  '* repasar para examen *',
];

function TransformVisual({ autoplay }) {
  const [view, setView] = React.useState('original');
  const [scanKey, setScanKey] = React.useState(0);
  const [cleanKey, setCleanKey] = React.useState(0);
  const [scanning, setScanning] = React.useState(false);
  const started = React.useRef(false);

  const goTo = React.useCallback((next) => {
    setView(next);
    if (next === 'clean') { setScanning(true); setScanKey((k) => k + 1); setCleanKey((k) => k + 1); }
    else { setScanning(false); }
  }, []);

  // first-load transform once
  React.useEffect(() => {
    if (started.current) return;
    started.current = true;
    const t = setTimeout(() => goTo('clean'), 1100);
    return () => clearTimeout(t);
  }, [goTo]);

  // optional gentle autoplay loop
  React.useEffect(() => {
    if (!autoplay) return;
    const id = setInterval(() => { setView((v) => { const n = v === 'clean' ? 'original' : 'clean'; if (n === 'clean') { setScanning(true); setScanKey((k) => k + 1); setCleanKey((k) => k + 1); } return n; }); }, 3600);
    return () => clearInterval(id);
  }, [autoplay]);

  const clean = view === 'clean';

  return (
    <div className="hero__visual" data-reveal data-delay="2">
      <div className="note-paper">
        <div className="note-paper__meta">
          <span className="note-paper__eyebrow">Spanish 201</span>
          <span className="note-paper__detail">es → en · 1,204 words · OCR 98%</span>
        </div>

        <div className="note-stage">
          {/* Original — faux handwriting */}
          <div className={`note-layer note-layer--original ${clean ? 'note-layer--hidden' : ''}`} aria-hidden={clean}>
            <div className="hand-paper">
              {HAND_LINES.map((l, i) => (
                <div key={i} className="hand-line" style={{ transform: `rotate(${i % 2 ? -0.5 : 0.6}deg)` }}>{l}</div>
              ))}
            </div>
          </div>

          {/* Clean — transformed note */}
          <div className={`note-layer note-layer--clean ${clean ? '' : 'note-layer--hidden'}`} aria-hidden={!clean} key={'clean-' + cleanKey}>
            <div className="clean-note">
              <h3 className="clean-note__title">The subjunctive mood</h3>
              <p className="clean-note__body">
                The <HighlightText animate={clean}>subjunctive</HighlightText> expresses doubt, desire and
                possibility — three verb patterns across <em>-ar</em>, <em>-er</em>, <em>-ir</em>.
              </p>
              <p className="clean-note__es">que yo hable · que tú comas · que él viva</p>
              <div className="clean-note__tags">
                <Tag hash tone="brand">subjunctive</Tag>
                <Tag hash>verbs</Tag>
              </div>
            </div>
          </div>

          {scanning ? <div className="note-scan note-scan--run" key={'scan-' + scanKey} onAnimationEnd={() => setScanning(false)} /> : null}
        </div>

        <div className="note-paper__foot">
          <SegmentedControl
            value={view}
            onChange={goTo}
            options={[
              { value: 'original', label: 'Original', icon: <Ico n="scan-line" size={15} /> },
              { value: 'clean', label: 'Clean', icon: <Ico n="sparkles" size={15} /> },
            ]}
          />
          <Badge tone="success" dot>12 highlights</Badge>
        </div>
      </div>

      <div className={`hero__chip ${clean ? '' : 'hero__chip--hidden'}`}>
        <span className="hero__chip-ico"><Ico n="check" size={15} /></span>
        Note transformed in seconds
      </div>
    </div>
  );
}

function Hero({ tweaks }) {
  return (
    <section className="hero" id="top">
      <div className="container hero__grid">
        <div className="hero__text">
          {tweaks.showAccentLine ? (
            <div className="hero__accent" data-reveal>your notes, transformed</div>
          ) : null}
          <h1 className="hero__title" data-reveal data-delay="1">
            {tweaks.highlightHeadline
              ? (<>Your handwriting, <HighlightText animate>transformed</HighlightText></>)
              : 'Your handwriting, transformed'}
          </h1>
          <p className="hero__sub" data-reveal data-delay="2">
            Snap a photo of your handwritten notes. AI reads your handwriting and turns it into clean,
            searchable, highlighted notes — ready to study and share.
          </p>
          <div className="hero__cta" data-reveal data-delay="3">
            <Button as="a" href={SIGNUP} variant="primary" size="lg" leftIcon={<Ico n="scan-line" size={18} />}>Request access</Button>
            <Button as="a" href={LOGIN} variant="secondary" size="lg">Sign in</Button>
          </div>
        </div>
        <TransformVisual autoplay={tweaks.autoplay} />
      </div>
    </section>
  );
}

/* ============================================================ Capability cards */
const CAPS = [
  { icon: 'scan-line', title: 'Capture', desc: 'Photograph any handwritten page with your phone camera.' },
  { icon: 'sparkles', title: 'Transform', desc: 'AI reads your handwriting and produces clean, highlighted notes — no manual typing.', accent: true },
  { icon: 'search', title: 'Search', desc: "Full-text search across every note you've transformed." },
  { icon: 'layers', title: 'Review', desc: 'A built-in spaced-repetition study deck keeps your learning active.' },
  { icon: 'users', title: 'Groups', desc: 'Share notes inside invite-gated groups.' },
  { icon: 'lock', title: 'Invite-gated access', desc: 'A calm, members-only space — no noise, no open sign-ups.' },
];

function Capabilities({ tweaks }) {
  const list = tweaks.leanCards ? CAPS.filter((c) => ['Capture', 'Transform', 'Search', 'Groups'].includes(c.title)) : CAPS;
  const { Card } = NS;
  return (
    <section className="section-pad">
      <div className="container">
        <div className="cards-head" data-reveal>
          <span className="eyebrow">What it does</span>
          <h2 className="section-heading">Everything from one photo of a page.</h2>
        </div>
        <div className="card-grid">
          {list.map((c, i) => (
            <div data-reveal data-delay={(i % 3) + 1} key={c.title} className={`cap-card ${c.accent ? 'cap-card--accent' : ''}`}>
              <Card padded accentBar={tweaks.cardAccentBar && c.accent} style={{ height: '100%' }}>
                <div className="cap-card__inner">
                  <span className="cap-icon"><Ico n={c.icon} size={23} /></span>
                  <h3 className="cap-title">{c.title}</h3>
                  <p className="cap-desc">{c.desc}</p>
                </div>
              </Card>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============================================================ How it works */
const STEPS = [
  { n: 1, title: 'Snap', desc: 'Photograph your handwritten page with your phone. Any handwriting, any paper.' },
  { n: 2, title: 'Transform', desc: 'The AI reads your handwriting and produces clean, highlighted notes in seconds.' },
  { n: 3, title: 'Study', desc: 'Search, review with spaced repetition, and share in invite-gated groups.' },
];

function HowItWorks() {
  return (
    <section className="how section-pad">
      <div className="container">
        <div className="how-head" data-reveal>
          <span className="eyebrow">How it works</span>
          <h2 className="section-heading">Three calm steps</h2>
        </div>
        <div className="steps">
          <div className="steps__line" aria-hidden="true"></div>
          {STEPS.map((s, i) => (
            <div className="step" data-reveal data-delay={i + 1} key={s.n}>
              <span className="step__num">{s.n}</span>
              <h3 className="step__title">{s.title}</h3>
              <p className="step__desc">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============================================================ Closing access */
function Closing() {
  return (
    <section className="closing-wrap">
      <div className="container">
        <div className="closing" data-reveal>
          <div className="closing__bar" aria-hidden="true"></div>
          <h2 className="closing__title">Request access</h2>
          <p className="closing__note">
            Access is invite-gated. Request a spot and we'll be in touch. Already a member? Sign in.
          </p>
          <div className="closing__cta">
            <Button as="a" href={SIGNUP} variant="primary" size="lg">Request access</Button>
            <Button as="a" href={LOGIN} variant="secondary" size="lg">Sign in</Button>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============================================================ Footer */
function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <div className="footer-brand">
          <img src="assets/logo-wordmark.svg" alt="TransformMyNotes" />
          <span className="footer-tag">Your handwriting, transformed.</span>
        </div>
        <nav className="footer-links" aria-label="Footer">
          <a className="footer-link" href={LOGIN}>Sign in</a>
          <span className="footer-dot" aria-hidden="true">·</span>
          <a className="footer-link" href={SIGNUP}>Request access</a>
        </nav>
      </div>
    </footer>
  );
}

/* ============================================================ App */
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "showAccentLine": true,
  "highlightHeadline": false,
  "autoplay": false,
  "cardCount": "six",
  "cardAccentBar": true,
  "density": "generous"
}/*EDITMODE-END*/;

function App() {
  useReveal();
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const tweaks = { ...t, leanCards: t.cardCount === 'four' };

  React.useEffect(() => {
    document.documentElement.style.setProperty('--section-y', t.density === 'compact' ? 'var(--space-11)' : 'calc(var(--space-12) + var(--space-4))');
  }, [t.density]);

  return (
    <React.Fragment>
      <Header />
      <main>
        <Hero tweaks={tweaks} />
        <Capabilities tweaks={tweaks} />
        <HowItWorks />
        <Closing />
      </main>
      <Footer />

      <TweaksPanel>
        <TweakSection label="Hero" />
        <TweakToggle label="Accent line" value={t.showAccentLine} onChange={(v) => setTweak('showAccentLine', v)} />
        <TweakToggle label="Highlight “transformed”" value={t.highlightHeadline} onChange={(v) => setTweak('highlightHeadline', v)} />
        <TweakToggle label="Auto-replay transform" value={t.autoplay} onChange={(v) => setTweak('autoplay', v)} />
        <TweakSection label="Layout" />
        <TweakRadio label="Capability cards" value={t.cardCount} options={[{ value: 'six', label: 'Six' }, { value: 'four', label: 'Four' }]} onChange={(v) => setTweak('cardCount', v)} />
        <TweakToggle label="Card accent bar" value={t.cardAccentBar} onChange={(v) => setTweak('cardAccentBar', v)} />
        <TweakRadio label="Density" value={t.density} options={[{ value: 'compact', label: 'Compact' }, { value: 'generous', label: 'Generous' }]} onChange={(v) => setTweak('density', v)} />
      </TweaksPanel>
    </React.Fragment>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
