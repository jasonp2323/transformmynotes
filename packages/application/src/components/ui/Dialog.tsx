'use client';

import React, { useEffect, useRef } from 'react';
import { cn } from '@/src/lib/cn';

export interface DialogProps {
  open: boolean;
  onClose?: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    function handleClose() {
      onClose?.();
    }
    function handleCancel(e: Event) {
      e.preventDefault();
      onClose?.();
    }
    d.addEventListener('close', handleClose);
    d.addEventListener('cancel', handleCancel);
    return () => {
      d.removeEventListener('close', handleClose);
      d.removeEventListener('cancel', handleCancel);
    };
  }, [onClose]);

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === ref.current) {
      onClose?.();
    }
  }

  return (
    <dialog
      ref={ref}
      className="tmn-dialog-native"
      aria-label={typeof title === 'string' ? title : undefined}
      onClick={handleBackdropClick}
    >
      <div className={cn('tmn-dialog', className)}>
        {(title || description) && (
          <div className="tmn-dialog__body">
            {title && <h2 className="tmn-dialog__title">{title}</h2>}
            {description && <p className="tmn-dialog__desc">{description}</p>}
          </div>
        )}
        {children && <div className="tmn-dialog__content">{children}</div>}
        {footer && <div className="tmn-dialog__footer">{footer}</div>}
      </div>
    </dialog>
  );
}
