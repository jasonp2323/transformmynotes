/* TransformMyNotes — Auth & onboarding screens */
const { Button, Input, Badge, Tag, Avatar, Checkbox, Switch, SegmentedControl, HighlightText, IconButton, Card } = window.TMN_NS;
/* Ico, PhoneScreen, HandNote, StatusBar, HomeIndicator are global from ds-helpers */

/* Password field composed from the DS field/input classes + a reveal button */
function PasswordField({ label = 'Password', value, onChange, placeholder = 'Your password', hint }) {
  const [show, setShow] = React.useState(false);
  const id = React.useId();
  return (
    <div className="tmn-field">
      <label className="tmn-field__label" htmlFor={id}>{label}</label>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <input id={id} type={show ? 'text' : 'password'} className="tmn-input" value={value}
          onChange={(e) => onChange && onChange(e.target.value)} placeholder={placeholder}
          style={{ paddingRight: 44 }} />
        <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}
          style={{ position: 'absolute', right: 8, border: 'none', background: 'transparent', cursor: 'pointer',
            color: 'var(--text-subtle)', width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Ico n={show ? 'eye-off' : 'eye'} size={18} />
        </button>
      </div>
      {hint && <span className="tmn-field__hint">{hint}</span>}
    </div>
  );
}

const Brandmark = ({ size = 40, label = true, color = 'var(--text-strong)' }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
    <img src="assets/logo-mark.svg" width={size} height={size} alt="" />
    {label && <span style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: size * 0.52, color, letterSpacing: '-0.01em' }}>TransformMyNotes</span>}
  </div>
);

const AuthLink = ({ children, onClick }) => (
  <span onClick={onClick} style={{ color: 'var(--text-link)', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>{children}</span>
);

/* ===================================================== LOGIN — A · calm */
function LoginCalm() {
  const [email, setEmail] = React.useState('ana.ruiz@gmail.com');
  const [pw, setPw] = React.useState('lumbre-2026');
  return (
    <PhoneScreen>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '20px 28px 0' }}>
        <div style={{ marginTop: 40 }}>
          <img src="assets/logo-mark.svg" width="52" height="52" alt="" />
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 32, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--text-strong)', margin: '22px 0 8px', lineHeight: 1.1 }}>
            Welcome back
          </h1>
          <p style={{ fontFamily: 'var(--font-serif)', fontSize: 16.5, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
            Sign in to pick up your notebook where you left off.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 32 }}>
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            leadingIcon={<Ico n="mail" size={18} />} placeholder="you@email.com" />
          <PasswordField value={pw} onChange={setPw} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: -4 }}>
            <AuthLink>Forgot password?</AuthLink>
          </div>
          <Button variant="primary" size="lg" fullWidth>Sign in</Button>
        </div>

        <div style={{ flex: 1 }} />
        <div style={{ textAlign: 'center', padding: '18px 0 26px', fontFamily: 'var(--font-sans)', fontSize: 14.5, color: 'var(--text-muted)' }}>
          New to the notebook? <AuthLink>Request access</AuthLink>
        </div>
      </div>
    </PhoneScreen>
  );
}

/* ===================================================== LOGIN — B · branded */
function LoginBranded() {
  const [email, setEmail] = React.useState('');
  const [pw, setPw] = React.useState('');
  return (
    <PhoneScreen dark statusBar={false} bg="var(--surface-card)">
      <div style={{ position: 'relative', flex: 'none', height: 312, background: 'var(--gradient-transform)', overflow: 'hidden' }}>
        <StatusBarDark />
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.16,
          backgroundImage: 'repeating-linear-gradient(transparent, transparent 30px, rgba(255,255,255,0.7) 30px, rgba(255,255,255,0.7) 31px)',
        }} />
        <div style={{ position: 'relative', padding: '4px 30px 0' }}>
          <img src="assets/logo-mark.svg" width="46" height="46" alt="" style={{ filter: 'drop-shadow(0 6px 14px rgba(0,0,0,0.25))' }} />
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 33, fontWeight: 600, color: '#fff', letterSpacing: '-0.02em', lineHeight: 1.12, margin: '20px 0 0', textShadow: '0 2px 12px rgba(0,0,0,0.18)' }}>
            Turn handwriting<br />into <span style={{ background: 'var(--highlighter-strong)', padding: '0 6px', borderRadius: 5, color: '#211e17' }}>clean notes</span>
          </h1>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--surface-card)', borderRadius: '22px 22px 0 0', marginTop: -22, position: 'relative', padding: '26px 28px 0' }}>
        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 21, fontWeight: 600, color: 'var(--text-strong)', margin: '0 0 18px' }}>Sign in</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            leadingIcon={<Ico n="mail" size={18} />} placeholder="you@email.com" />
          <PasswordField value={pw} onChange={setPw} />
          <Button variant="primary" size="lg" fullWidth rightIcon={<Ico n="arrow-right" size={18} />}>Sign in</Button>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--text-muted)' }}>
            <AuthLink>Request access</AuthLink>
            <AuthLink>Forgot password?</AuthLink>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <HomeIndicatorWrap />
      </div>
    </PhoneScreen>
  );
}
const StatusBarDark = () => <div style={{ paddingTop: 8 }}><window.StatusBar dark /></div>;
const HomeIndicatorWrap = () => <window.HomeIndicator />;

/* =============================================== REGISTER — A · inline code */
function RegisterInline() {
  const [code, setCode] = React.useState('SPAN-7K2Q');
  const valid = code.trim().toUpperCase() === 'SPAN-7K2Q';
  return (
    <PhoneScreen>
      <div className="tmn-scroll" style={{ flex: 1, overflow: 'auto', padding: '14px 28px 28px' }}>
        <BackRow title="Create account" />
        <p style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--text-muted)', margin: '4px 0 22px', lineHeight: 1.5 }}>
          A code joins you instantly. Without one, we’ll review your request.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
          <Input label="Full name" placeholder="Ana Ruiz" defaultValue="Ana Ruiz" />
          <Input label="Email" type="email" placeholder="you@email.com" defaultValue="ana.ruiz@gmail.com" />
          <PasswordField label="Create password" hint="At least 8 characters." />
          <Input label="Invite code" placeholder="e.g. SPAN-7K2Q" value={code} onChange={(e) => setCode(e.target.value)}
            leadingIcon={<Ico n="ticket" size={18} />}
            trailingIcon={valid ? <Ico n="check-circle-2" size={18} style={{ color: 'var(--success)' }} /> : null}
            hint={valid ? 'Valid — you\u2019ll join Spanish 201 right away.' : 'Optional — leave blank to request access.'} />
        </div>
        <Button variant="primary" size="lg" fullWidth style={{ marginTop: 22 }}>
          {valid ? 'Join Spanish 201' : 'Request access'}
        </Button>
        <p style={{ textAlign: 'center', fontFamily: 'var(--font-sans)', fontSize: 13.5, color: 'var(--text-subtle)', margin: '16px 0 0' }}>
          Already have an account? <AuthLink>Sign in</AuthLink>
        </p>
      </div>
    </PhoneScreen>
  );
}

/* ============================================ REGISTER — B · segmented code */
function CodeBoxes({ value, onChange, len = 8, group = 4 }) {
  const chars = value.padEnd(len, ' ').slice(0, len).split('');
  const filled = value.replace(/[^A-Za-z0-9]/g, '').length;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {chars.map((c, i) => {
        const active = i === Math.min(filled, len - 1);
        const has = c.trim() !== '';
        return (
          <React.Fragment key={i}>
            <div style={{
              width: 34, height: 46, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 600, color: 'var(--text-strong)',
              background: has ? 'var(--surface-card)' : 'var(--surface-sunken)',
              border: `1.5px solid ${active ? 'var(--brand)' : has ? 'var(--border-default)' : 'var(--border-subtle)'}`,
              boxShadow: active ? 'var(--focus-ring)' : 'var(--shadow-inset)', transition: 'all 140ms var(--ease-soft)',
            }}>{c.trim().toUpperCase()}</div>
            {group && (i + 1) % group === 0 && i < len - 1 && (
              <span style={{ color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)', fontSize: 18 }}>-</span>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
function RegisterCode() {
  const [code, setCode] = React.useState('SPAN7K2Q');
  return (
    <PhoneScreen>
      <div className="tmn-scroll" style={{ flex: 1, overflow: 'auto', padding: '14px 28px 28px' }}>
        <BackRow title="Enter your invite" />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', margin: '12px 0 6px' }}>
          <div style={{ width: 60, height: 60, borderRadius: 18, background: 'var(--surface-brand-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
            <Ico n="ticket" size={28} style={{ color: 'var(--brand-strong)' }} />
          </div>
          <p style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5, maxWidth: 260 }}>
            Type the 8-character code from your invite email.
          </p>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', margin: '20px 0 10px' }}>
          <CodeBoxes value={code} onChange={setCode} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 22 }}>
          <Badge tone="success" dot>Code recognised · Spanish 201</Badge>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 15, borderTop: '1px solid var(--border-subtle)', paddingTop: 20 }}>
          <Input label="Full name" placeholder="Your name" defaultValue="Marco Bianchi" />
          <PasswordField label="Create password" hint="At least 8 characters." />
        </div>
        <Button variant="primary" size="lg" fullWidth style={{ marginTop: 22 }} leftIcon={<Ico n="sparkles" size={18} />}>
          Create account & join
        </Button>
        <p style={{ textAlign: 'center', fontFamily: 'var(--font-sans)', fontSize: 13.5, color: 'var(--text-subtle)', margin: '16px 0 0' }}>
          No code? <AuthLink>Request access instead</AuthLink>
        </p>
      </div>
    </PhoneScreen>
  );
}

/* ===================================================== PENDING APPROVAL */
function PendingApproval() {
  const steps = [
    { label: 'Request received', done: true, sub: 'Just now' },
    { label: 'Admin review', done: false, active: true, sub: 'Usually within a day' },
    { label: 'Access granted', done: false, sub: 'We\u2019ll email you' },
  ];
  return (
    <PhoneScreen>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '20px 30px 0' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
          <div style={{ position: 'relative', width: 96, height: 96, borderRadius: 28, background: 'var(--gradient-transform)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-brand)', marginBottom: 26 }}>
            <Ico n="hourglass" size={42} style={{ color: '#fff' }} />
          </div>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 27, fontWeight: 600, color: 'var(--text-strong)', letterSpacing: '-0.01em', margin: '0 0 10px' }}>
            Your request is in
          </h1>
          <p style={{ fontFamily: 'var(--font-serif)', fontSize: 16.5, color: 'var(--text-muted)', margin: '0 0 26px', lineHeight: 1.6, maxWidth: 290 }}>
            Thanks, Marco. An admin will review your access to <strong style={{ color: 'var(--text-body)' }}>Spanish&nbsp;201</strong> shortly.
          </p>

          <div style={{ width: '100%', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 0 }}>
            {steps.map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: '50%', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: s.done ? 'var(--brand)' : s.active ? 'var(--surface-accent-soft)' : 'var(--surface-sunken)',
                    border: s.active ? '2px solid var(--accent)' : 'none', color: s.done ? '#fff' : 'var(--text-subtle)',
                  }}>
                    {s.done ? <Ico n="check" size={15} stroke={3} /> : <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.active ? 'var(--accent-press)' : 'var(--stone-400)' }} />}
                  </div>
                  {i < steps.length - 1 && <div style={{ width: 2, height: 30, background: s.done ? 'var(--brand)' : 'var(--border-default)' }} />}
                </div>
                <div style={{ paddingBottom: 18 }}>
                  <div style={{ fontFamily: 'var(--font-sans)', fontSize: 15, fontWeight: 600, color: s.done || s.active ? 'var(--text-strong)' : 'var(--text-subtle)' }}>{s.label}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-subtle)', marginTop: 2 }}>{s.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ flex: 'none', padding: '6px 0 26px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'var(--surface-brand-soft)', borderRadius: 12, marginBottom: 16 }}>
            <Ico n="mail" size={18} style={{ color: 'var(--brand-strong)' }} />
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13.5, color: 'var(--brand-strong)' }}>We’ll notify <strong>marco.bianchi@gmail.com</strong></span>
          </div>
          <Button variant="ghost" size="md" fullWidth>Back to sign in</Button>
        </div>
      </div>
    </PhoneScreen>
  );
}

/* ===================================================== INVITE ACCEPTANCE */
function InviteAccept() {
  return (
    <PhoneScreen>
      <div className="tmn-scroll" style={{ flex: 1, overflow: 'auto', padding: '20px 28px 28px' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12, marginBottom: 18 }}>
          <Brandmark size={30} />
        </div>
        <Card padded style={{ background: 'var(--surface-brand-soft)', borderColor: 'transparent' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar name="Ana Ruiz" size="md" />
            <div>
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--text-muted)' }}><strong style={{ color: 'var(--text-strong)' }}>Ana Ruiz</strong> invited you</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--brand-strong)', marginTop: 2 }}>to join Spanish 201</div>
            </div>
          </div>
        </Card>

        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 26, fontWeight: 600, color: 'var(--text-strong)', letterSpacing: '-0.01em', margin: '22px 0 6px' }}>
          Accept your invite
        </h1>
        <p style={{ fontFamily: 'var(--font-serif)', fontSize: 15.5, color: 'var(--text-muted)', margin: '0 0 22px', lineHeight: 1.5 }}>
          Your email and code are already confirmed. Just set a name and password.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
          <LockedField label="Email" value="marco.bianchi@gmail.com" icon="mail" />
          <LockedField label="Invite code" value="SPAN-7K2Q" icon="ticket" badge="Validated" mono />
          <Input label="Full name" placeholder="Your name" defaultValue="Marco Bianchi" />
          <PasswordField label="Create password" hint="At least 8 characters." />
        </div>
        <Button variant="primary" size="lg" fullWidth style={{ marginTop: 22 }} leftIcon={<Ico n="sparkles" size={18} />}>
          Accept & create account
        </Button>
        <p style={{ textAlign: 'center', fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--text-subtle)', margin: '16px 0 0', lineHeight: 1.5 }}>
          This invite expires in 6 days. By continuing you agree to the study-group guidelines.
        </p>
      </div>
    </PhoneScreen>
  );
}

function LockedField({ label, value, icon, badge, mono }) {
  return (
    <div className="tmn-field">
      <label className="tmn-field__label">{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', minHeight: 44, boxSizing: 'border-box',
        background: 'var(--stone-100)', border: '1.5px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
        <Ico n={icon} size={18} style={{ color: 'var(--text-subtle)' }} />
        <span style={{ flex: 1, fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)', fontSize: mono ? 14 : 15, color: 'var(--text-body)', fontWeight: mono ? 600 : 400 }}>{value}</span>
        {badge
          ? <Badge tone="success" dot>{badge}</Badge>
          : <Ico n="lock" size={15} style={{ color: 'var(--text-subtle)' }} />}
      </div>
    </div>
  );
}

/* Shared back row */
function BackRow({ title }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '6px 0 14px' }}>
      <IconButton label="Back" variant="plain" size="sm" style={{ marginLeft: -8 }}><Ico n="chevron-left" size={22} /></IconButton>
      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 24, fontWeight: 600, color: 'var(--text-strong)', margin: 0, letterSpacing: '-0.01em' }}>{title}</h1>
    </div>
  );
}

Object.assign(window, { LoginCalm, LoginBranded, RegisterInline, RegisterCode, PendingApproval, InviteAccept, Brandmark });
