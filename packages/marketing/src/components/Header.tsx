'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import Button from './ui/Button';
import IconButton from './ui/IconButton';
import { SIGNUP_URL, LOGIN_URL } from '../lib/appLinks';

export default function Header() {
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as Element).closest('.site-header')) setMenu(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(false);
    };
    document.addEventListener('click', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', esc);
    };
  }, [menu]);

  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <a className="brand-lockup" href="#top" aria-label="TransformMyNotes home">
          <Image
            src="/logo-wordmark.svg"
            alt="TransformMyNotes"
            width={180}
            height={30}
            priority
          />
        </a>
        <div className="header-actions">
          <Link href="/changelog" className="header-nav-link header-actions__whatsnew">
            What&apos;s new
          </Link>
          <Link href="/download" className="header-nav-link header-actions__whatsnew">
            Android app
          </Link>
          <Button
            as="a"
            href={LOGIN_URL}
            variant="ghost"
            size="sm"
            className="header-actions__signin"
          >
            Sign in
          </Button>
          <Button as="a" href={SIGNUP_URL} variant="primary" size="sm">
            Request access
          </Button>
          <IconButton
            className="header-actions__menu-btn"
            label={menu ? 'Close menu' : 'Open menu'}
            size="sm"
            aria-expanded={menu}
            onClick={(e) => {
              e.stopPropagation();
              setMenu((v) => !v);
            }}
          >
            {menu ? (
              <X size={20} aria-hidden />
            ) : (
              <Menu size={20} aria-hidden />
            )}
          </IconButton>
        </div>
        {menu ? (
          <div className="mobile-menu" role="menu">
            <Button as="a" href={SIGNUP_URL} variant="primary" size="md" fullWidth>
              Request access
            </Button>
            <Button as="a" href={LOGIN_URL} variant="secondary" size="md" fullWidth>
              Sign in
            </Button>
            <Link href="/changelog" className="mobile-menu__link">
              What&apos;s new
            </Link>
            <Link href="/download" className="mobile-menu__link">
              Android app
            </Link>
          </div>
        ) : null}
      </div>
    </header>
  );
}
