'use client';
import React from 'react';
import Link from 'next/link';

export interface AuthLinkProps {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
}

export function AuthLink({ children, href, onClick }: AuthLinkProps) {
  const style: React.CSSProperties = {
    color: 'var(--text-link)',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'var(--font-sans)',
    textDecoration: 'none',
  };

  if (href) {
    return (
      <Link href={href} style={style}>
        {children}
      </Link>
    );
  }

  return (
    <span role="button" tabIndex={0} onClick={onClick} style={style}>
      {children}
    </span>
  );
}
