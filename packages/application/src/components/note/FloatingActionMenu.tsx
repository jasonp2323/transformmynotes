'use client';

import React, { useEffect, useState } from 'react';
import { Icon } from '@/src/components/ui';

interface FloatingActionMenuProps {
  children: React.ReactNode;
}

export function FloatingActionMenu({ children }: FloatingActionMenuProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open]);

  return (
    <>
      {open && (
        <div
          className="tmn-fab-backdrop"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}
      {open && (
        <div
          className="tmn-fab-menu"
          role="menu"
          onClickCapture={(e) => {
            if ((e.target as HTMLElement).closest('button')) {
              setOpen(false);
            }
          }}
        >
          {children}
        </div>
      )}
      <button
        className="tmn-fab"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={open ? 'Close actions' : 'Actions'}
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        {open ? <Icon name="x" size={22} /> : <Icon name="menu" size={24} />}
      </button>
    </>
  );
}
