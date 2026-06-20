'use client';

import React, { useEffect, useState } from 'react';
import { Button, Dialog, Textarea } from '@/src/components/ui';

export interface CardFormProps {
  open: boolean;
  /** Modal title, e.g. "Add card" or "New card". */
  title: string;
  onClose: () => void;
  /** Called when the user saves valid front+back. May be async; while it
   *  resolves, the form should show the saving state. Throwing/rejecting
   *  should leave the dialog open (the caller surfaces its own error toast). */
  onSave: (values: { front: string; back: string }) => Promise<void> | void;
  /** When true, disable inputs + show the Save button in a loading state. */
  saving?: boolean;
  /** Optional extra content rendered ABOVE the front/back fields — the Review
   *  tab passes a note picker here; the note view passes nothing. */
  children?: React.ReactNode;
}

export function CardForm({ open, title, onClose, onSave, saving = false, children }: CardFormProps) {
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');

  // Reset fields whenever the dialog transitions from closed → open
  useEffect(() => {
    if (open) {
      setFront('');
      setBack('');
    }
  }, [open]);

  const canSave = front.trim().length > 0 && back.trim().length > 0 && !saving;

  async function handleSave() {
    if (!canSave) return;
    try {
      await onSave({ front: front.trim(), back: back.trim() });
    } catch {
      // Swallow — caller surfaces the error toast; dialog stays open
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <div className="tmn-card-form__footer">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!canSave}
            loading={saving}
            onClick={() => void handleSave()}
          >
            Save
          </Button>
        </div>
      }
    >
      {children && <div className="tmn-card-form__slot">{children}</div>}

      <div className="tmn-card-form__fields">
        <Textarea
          label="Front"
          placeholder="Question or prompt"
          value={front}
          onChange={(e) => setFront(e.target.value)}
          maxLength={300}
          rows={3}
          disabled={saving}
        />
        <Textarea
          label="Back"
          placeholder="Answer"
          value={back}
          onChange={(e) => setBack(e.target.value)}
          maxLength={600}
          rows={4}
          disabled={saving}
        />
      </div>
    </Dialog>
  );
}

CardForm.displayName = 'CardForm';
