import { ScanLine } from 'lucide-react';
import Button from './ui/Button';
import TransformVisual from './TransformVisual';

const SIGNUP = 'https://app.transformmynotes.com/signup';
const LOGIN = 'https://app.transformmynotes.com/login';

export default function Hero() {
  return (
    <section className="hero" id="top">
      <div className="container hero__grid">
        <div className="hero__text">
          {/* Accent line — design default: shown */}
          <div className="hero__accent" data-reveal>
            your notes, transformed
          </div>

          {/* Headline — design default: NOT highlighted */}
          <h1 className="hero__title" data-reveal data-delay="1">
            Your handwriting, transformed
          </h1>

          <p className="hero__sub" data-reveal data-delay="2">
            Snap a photo of your handwritten notes. AI reads your handwriting and turns it into
            clean, searchable, highlighted notes — ready to study and share.
          </p>

          <div className="hero__cta" data-reveal data-delay="3">
            <Button
              as="a"
              href={SIGNUP}
              variant="primary"
              size="lg"
              leftIcon={<ScanLine size={18} aria-hidden />}
            >
              Request access
            </Button>
            <Button as="a" href={LOGIN} variant="secondary" size="lg">
              Sign in
            </Button>
          </div>
        </div>

        {/* autoplay off — design default */}
        <TransformVisual autoplay={false} />
      </div>
    </section>
  );
}
