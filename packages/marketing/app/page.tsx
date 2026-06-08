// M9.1 shell placeholder — real hero, cards, how-it-works, CTA strip, and footer
// are built in M9.2–M9.6. This page exists only to prove the shell frame renders
// (background, fonts, container utility) and to give the App Router a valid <main>.

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.transformmynotes.com';
const signupHref = appUrl.startsWith('http') ? `${appUrl}/signup` : 'https://app.transformmynotes.com/signup';

export default function HomePage() {
  return (
    <main>
      <div className="container">
        {/* Brand wordmark — inline SVG so the logo mark renders with no <img> (avoids
            the @next/next/no-img-element lint rule) and without a network request. */}
        <svg
          width="40"
          height="40"
          viewBox="0 0 96 96"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          role="img"
          aria-label="TransformMyNotes"
          style={{ display: 'block', marginBottom: '24px', marginTop: '48px' }}
        >
          <defs>
            <linearGradient id="tmn-grad-page" x1="8" y1="86" x2="88" y2="10" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#16747e" />
              <stop offset="0.36" stopColor="#4a8a62" />
              <stop offset="0.68" stopColor="#97ab38" />
              <stop offset="1" stopColor="#ffd700" />
            </linearGradient>
          </defs>
          <rect x="4" y="4" width="88" height="88" rx="26" fill="url(#tmn-grad-page)" />
          <path d="M30 22h26l12 12v40a4 4 0 0 1-4 4H30a4 4 0 0 1-4-4V26a4 4 0 0 1 4-4z" fill="#fffdf8" />
          <path d="M56 22l12 12H60a4 4 0 0 1-4-4V22z" fill="#efe7d2" />
          <rect x="34" y="58.5" width="30" height="9" rx="4.5" fill="#ffd700" fillOpacity="0.55" />
          <path d="M34 44c3-3 5 3 8 0s5 3 8 0 5 3 8 0" stroke="#16747e" strokeWidth="3" strokeLinecap="round" fill="none" />
          <rect x="34" y="58" width="30" height="3.4" rx="1.7" fill="#307f70" />
          <rect x="34" y="71" width="22" height="3.4" rx="1.7" fill="#307f70" />
        </svg>

        <h1 style={{ fontFamily: 'var(--font-serif)', fontWeight: 'var(--weight-semibold)' as React.CSSProperties['fontWeight'], fontSize: 'var(--text-3xl)', color: 'var(--text-strong)', margin: '0 0 16px', lineHeight: 'var(--leading-tight)' }}>
          TransformMyNotes
        </h1>

        <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-md)', color: 'var(--text-muted)', margin: '0 0 32px', maxWidth: '48ch' }}>
          Your handwriting, transformed — sections coming soon.
        </p>

        <a
          href={signupHref}
          style={{
            display: 'inline-block',
            background: 'var(--brand)',
            color: 'var(--on-brand)',
            fontFamily: 'var(--font-sans)',
            fontWeight: 'var(--weight-semibold)' as React.CSSProperties['fontWeight'],
            fontSize: 'var(--text-sm)',
            padding: '12px 24px',
            borderRadius: 'var(--radius-pill)',
            textDecoration: 'none',
          }}
        >
          Request access
        </a>
      </div>
    </main>
  );
}
