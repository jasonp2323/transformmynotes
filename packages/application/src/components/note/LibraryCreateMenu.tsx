'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon, Button } from '@/src/components/ui';

interface LibraryCreateMenuProps {
  variant: 'fab' | 'bar';
}

interface MenuAction {
  label: string;
  href: string;
  icon: string;
}

const ACTIONS: MenuAction[] = [
  { label: 'Capture note', href: '/capture', icon: 'scan-line' },
  { label: 'Upload document', href: '/sources?add=doc', icon: 'file-text' },
  { label: 'Add from URL', href: '/sources?add=url', icon: 'link' },
];

export function LibraryCreateMenu({ variant }: LibraryCreateMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open]);

  const toggle = () => setOpen((v) => !v);

  const handleSelect = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const popoverBase: React.CSSProperties = {
    position: 'absolute',
    right: 0,
    background: 'var(--surface-card)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 16,
    boxShadow: 'var(--shadow-lg)',
    padding: 8,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    minWidth: 220,
    zIndex: 46,
  };

  const menuItems = (
    <>
      {ACTIONS.map((action, i) => (
        <button
          key={action.href}
          type="button"
          role="menuitem"
          onClick={() => handleSelect(action.href)}
          onMouseEnter={() => setHovered(i)}
          onMouseLeave={() => setHovered((prev) => (prev === i ? null : prev))}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            width: '100%',
            padding: '10px 12px',
            border: 'none',
            background: hovered === i ? 'var(--surface-sunken)' : 'transparent',
            borderRadius: 10,
            cursor: 'pointer',
            textAlign: 'left',
            fontFamily: 'var(--font-sans)',
            fontSize: 14.5,
            fontWeight: 500,
            color: 'var(--text-strong)',
          }}
        >
          <Icon name={action.icon} size={18} />
          <span>{action.label}</span>
        </button>
      ))}
    </>
  );

  const backdrop = open ? (
    <div
      onClick={() => setOpen(false)}
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 44,
        background: 'rgba(0,0,0,0.04)',
      }}
    />
  ) : null;

  if (variant === 'fab') {
    return (
      <>
        {backdrop}
        <div ref={containerRef} style={{ position: 'relative', display: 'inline-flex' }}>
          {open && (
            <div
              role="menu"
              style={{ ...popoverBase, bottom: 'calc(100% + 12px)' }}
            >
              {menuItems}
            </div>
          )}
          <button
            type="button"
            onClick={toggle}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label={open ? 'Close create menu' : 'Create'}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 60,
              height: 60,
              borderRadius: '50%',
              background: 'var(--gradient-transform)',
              boxShadow: '0 10px 26px rgba(48,127,112,0.4)',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            {open ? (
              <Icon name="x" size={28} color="#fff" />
            ) : (
              <Icon name="plus" size={28} color="#fff" />
            )}
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      {backdrop}
      <div ref={containerRef} style={{ position: 'relative', display: 'inline-flex' }}>
        <Button
          variant="primary"
          size="sm"
          leftIcon={<Icon name="plus" size={16} />}
          onClick={toggle}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          Create
        </Button>
        {open && (
          <div
            role="menu"
            style={{ ...popoverBase, top: 'calc(100% + 8px)' }}
          >
            {menuItems}
          </div>
        )}
      </div>
    </>
  );
}

LibraryCreateMenu.displayName = 'LibraryCreateMenu';
