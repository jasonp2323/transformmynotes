import Image from 'next/image';
import Link from 'next/link';

const SIGNUP = 'https://app.transformmynotes.com/signup';
const LOGIN = 'https://app.transformmynotes.com/login';

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <div className="footer-brand">
          <Image
            src="/logo-wordmark.svg"
            alt="TransformMyNotes"
            width={140}
            height={28}
          />
          <span className="footer-tag">Your handwriting, transformed.</span>
        </div>
        <nav className="footer-links" aria-label="Footer">
          <Link className="footer-link" href="/changelog">
            What&apos;s new
          </Link>
          <span className="footer-dot" aria-hidden="true">·</span>
          <a className="footer-link" href={LOGIN}>
            Sign in
          </a>
          <span className="footer-dot" aria-hidden="true">·</span>
          <a className="footer-link" href={SIGNUP}>
            Request access
          </a>
        </nav>
      </div>
    </footer>
  );
}
