'use client';
import { useEffect } from 'react';
import { configureAmplify } from '../lib/amplify-config';

// Configure on module load (client bundle) so Amplify is ready before any
// auth call; the effect is a safety net for fast-refresh re-mounts in dev.
configureAmplify();

export function AmplifyProvider() {
  useEffect(() => {
    configureAmplify();
  }, []);
  return null;
}
