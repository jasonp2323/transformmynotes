'use client';

import React, { useCallback, useEffect, useRef } from 'react';

interface ImageLightboxProps {
  src: string;
  alt: string;
  open: boolean;
  onClose: () => void;
}

export function ImageLightbox({ src, alt, open, onClose }: ImageLightboxProps) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<Element | null>(null);

  // Capture the element that opened the lightbox so we can restore focus
  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement;
      // Prevent body scroll
      document.body.style.overflow = 'hidden';
      // Move focus to close button
      setTimeout(() => closeBtnRef.current?.focus(), 0);
    } else {
      document.body.style.overflow = '';
      // Restore focus to trigger
      if (triggerRef.current && triggerRef.current instanceof HTMLElement) {
        triggerRef.current.focus();
      }
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    },
    [onClose],
  );

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose],
  );

  if (!open) return null;

  return (
    <div
      className="tmn-lightbox-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Full-size image"
      onKeyDown={handleKeyDown}
      onClick={handleBackdropClick}
    >
      <button
        ref={closeBtnRef}
        className="tmn-lightbox-close"
        aria-label="Close image"
        onClick={onClose}
      >
        ×
      </button>
      <img
        className="tmn-lightbox-img"
        src={src}
        alt={alt}
      />
    </div>
  );
}
