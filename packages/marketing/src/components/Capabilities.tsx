import { Layers, Lock, ScanLine, Search, Sparkles, Users } from 'lucide-react';
import Card from './ui/Card';

interface CapItem {
  icon: 'scan-line' | 'sparkles' | 'search' | 'layers' | 'users' | 'lock';
  title: string;
  desc: string;
  accent?: boolean;
}

const CAPS: CapItem[] = [
  {
    icon: 'scan-line',
    title: 'Capture',
    desc: 'Photograph any handwritten page with your phone camera.',
  },
  {
    icon: 'sparkles',
    title: 'Transform',
    desc: 'AI reads your handwriting and produces clean, highlighted notes — no manual typing.',
    accent: true,
  },
  {
    icon: 'search',
    title: 'Search',
    desc: "Full-text search across every note you've transformed.",
  },
  {
    icon: 'layers',
    title: 'Review',
    desc: 'A built-in spaced-repetition study deck keeps your learning active.',
  },
  {
    icon: 'users',
    title: 'Groups',
    desc: 'Share notes inside invite-gated groups.',
  },
  {
    icon: 'lock',
    title: 'Invite-gated access',
    desc: 'A calm, members-only space — no noise, no open sign-ups.',
  },
];

function CapIcon({ name, size }: { name: CapItem['icon']; size: number }) {
  const props = { size, 'aria-hidden': true as const };
  switch (name) {
    case 'scan-line':
      return <ScanLine {...props} />;
    case 'sparkles':
      return <Sparkles {...props} />;
    case 'search':
      return <Search {...props} />;
    case 'layers':
      return <Layers {...props} />;
    case 'users':
      return <Users {...props} />;
    case 'lock':
      return <Lock {...props} />;
  }
}

export default function Capabilities() {
  return (
    <section className="section-pad">
      <div className="container">
        <div className="cards-head" data-reveal>
          <span className="eyebrow">What it does</span>
          <h2 className="section-heading">Everything from one photo of a page.</h2>
        </div>
        <div className="card-grid">
          {CAPS.map((c, i) => (
            <div
              data-reveal
              data-delay={String((i % 3) + 1)}
              key={c.title}
              className={`cap-card${c.accent ? ' cap-card--accent' : ''}`}
            >
              <Card padded accentBar={c.accent} style={{ height: '100%' }}>
                <div className="cap-card__inner">
                  <span className="cap-icon">
                    <CapIcon name={c.icon} size={23} />
                  </span>
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
