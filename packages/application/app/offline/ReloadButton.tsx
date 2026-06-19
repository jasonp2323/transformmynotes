'use client';

import { Button } from '@/src/components/ui/Button';

export function ReloadButton() {
  return (
    <Button
      variant="primary"
      size="lg"
      onClick={() => window.location.reload()}
    >
      Try again
    </Button>
  );
}
