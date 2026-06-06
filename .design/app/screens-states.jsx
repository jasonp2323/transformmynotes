/* TransformMyNotes — Key states: loading, error, success, offline */
const { Button: SBtn, Badge: SBadge, Toast: SToast, Card: SCard } = window.TMN_NS;
const { Ico: SIco, PhoneScreen: SPhone, HandNote: SHand } = window;

/* --------------------------------------------------- LOADING · processing */
function StateProcessing() {
  return (
    <SPhone>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 22, padding: '0 30px' }}>
        <div style={{ width: 92, height: 92, borderRadius: 26, background: 'var(--gradient-transform)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-brand)' }}>
          <SIco n="sparkles" size={42} style={{ color: '#fff' }} />
        </div>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 24, fontWeight: 600, color: 'var(--text-strong)' }}>Transforming…</div>
        <div style={{ width: 220, height: 7, borderRadius: 99, background: 'var(--surface-sunken)', overflow: 'hidden', boxShadow: 'var(--shadow-inset)' }}>
          <div style={{ height: '100%', width: '58%', borderRadius: 99, background: 'var(--gradient-transform)' }} />
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--text-muted)' }}>reading handwriting · OCR 98%</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6, width: '100%', maxWidth: 240 }}>
          {[['scan-line', 'Page detected', true], ['type', 'Text recognised', true], ['highlighter', 'Finding highlights', false]].map(([ic, label, done], i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'var(--font-sans)', fontSize: 14, color: done ? 'var(--text-body)' : 'var(--text-subtle)' }}>
              <SIco n={done ? 'check-circle-2' : ic} size={18} style={{ color: done ? 'var(--success)' : 'var(--text-subtle)' }} />
              {label}
            </div>
          ))}
        </div>
      </div>
    </SPhone>
  );
}

/* --------------------------------------------------------------- ERROR */
function StateError() {
  return (
    <SPhone>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '14px 28px 26px' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
          <div style={{ position: 'relative', marginBottom: 26 }}>
            <div style={{ filter: 'blur(2.5px) saturate(0.7)', opacity: 0.7, transform: 'rotate(-3deg)' }}>
              <SHand tilt={0} style={{ width: 170, padding: '16px 14px' }} />
            </div>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--danger-50)', border: '2px solid var(--danger-500)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <SIco n="image-off" size={24} style={{ color: 'var(--danger-500)' }} />
              </div>
            </div>
          </div>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 23, fontWeight: 600, color: 'var(--text-strong)', margin: '0 0 8px' }}>That page came out blurry</h2>
          <p style={{ fontFamily: 'var(--font-serif)', fontSize: 15.5, color: 'var(--text-muted)', margin: '0 0 18px', lineHeight: 1.6, maxWidth: 280 }}>
            We couldn&rsquo;t read the handwriting confidently. Try again with more light and the page flat.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 280 }}>
            {['Find even, natural light', 'Lay the page flat', 'Fit the whole page in frame'].map((t, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-sans)', fontSize: 13.5, color: 'var(--text-muted)', textAlign: 'left' }}>
                <SIco n="check" size={15} style={{ color: 'var(--success)' }} /> {t}
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <SBtn variant="primary" size="lg" fullWidth leftIcon={<SIco n="rotate-ccw" size={18} />}>Retake</SBtn>
          <SBtn variant="ghost" size="md" fullWidth>Upload a clearer photo</SBtn>
        </div>
      </div>
    </SPhone>
  );
}

/* -------------------------------------------------------------- SUCCESS */
function StateSuccess() {
  return (
    <SPhone bg="var(--surface-card)">
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 30px' }}>
        <div style={{ position: 'relative', width: 104, height: 104, marginBottom: 26 }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'var(--success-50)' }} />
          <div style={{ position: 'absolute', inset: 16, borderRadius: '50%', background: 'var(--success-500)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 26px rgba(74,138,98,0.4)' }}>
            <SIco n="check" size={40} stroke={3} style={{ color: '#fff' }} />
          </div>
        </div>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 27, fontWeight: 600, color: 'var(--text-strong)', margin: '0 0 10px' }}>Saved to your notebook</h1>
        <p style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--text-muted)', margin: '0 0 22px', lineHeight: 1.6, maxWidth: 290 }}>
          &ldquo;The subjunctive mood&rdquo; is clean and searchable. <strong style={{ color: 'var(--text-body)' }}>12 highlights</strong> were added to your review deck.
        </p>
        <div style={{ display: 'flex', gap: 16, marginBottom: 30, fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--text-subtle)' }}>
          <span>★ 12 highlights</span><span>1,204 words</span><span>OCR 98%</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 300 }}>
          <SBtn variant="primary" size="lg" fullWidth leftIcon={<SIco n="book-open" size={18} />}>View note</SBtn>
          <SBtn variant="ghost" size="md" fullWidth>Back to library</SBtn>
        </div>
      </div>
    </SPhone>
  );
}

/* -------------------------------------------------------------- OFFLINE */
function StateOffline() {
  return (
    <SPhone>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 20px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="assets/logo-mark.svg" width="32" height="32" alt="" />
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 22, fontWeight: 600, color: 'var(--text-strong)' }}>Library</span>
          </div>
          <SBadge tone="neutral" dot>Offline</SBadge>
        </div>
        <div style={{ margin: '0 20px', padding: '12px 14px', borderRadius: 12, background: 'var(--warning-50)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <SIco n="cloud-off" size={20} style={{ color: 'var(--warning-500)' }} />
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: 13.5, color: 'var(--stone-700)', lineHeight: 1.4 }}>
            <strong>You&rsquo;re offline.</strong> Edits are saved on this device and will sync when you reconnect.
          </div>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '0 30px 30px', textAlign: 'center' }}>
          <div style={{ width: 72, height: 72, borderRadius: 22, background: 'var(--surface-sunken)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <SIco n="wifi-off" size={32} style={{ color: 'var(--text-subtle)' }} />
          </div>
          <p style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--text-muted)', margin: 0, lineHeight: 1.6, maxWidth: 270 }}>
            Capture and transcription need a connection. Your saved notes are still readable below.
          </p>
        </div>
        <div style={{ position: 'absolute', left: 16, right: 16, bottom: 24 }}>
          <SToast tone="success" icon={<SIco n="check-circle-2" size={20} />} title="Changes saved locally">
            3 edits will sync automatically.
          </SToast>
        </div>
      </div>
    </SPhone>
  );
}

Object.assign(window, { StateProcessing, StateError, StateSuccess, StateOffline });
