import type { Metadata, Viewport } from 'next';
import '../src/styles/globals.css';
import { AmplifyProvider } from './amplify-provider';
import { NativeBridge } from './native-bridge';
import { PwaUpdater } from '../src/components/pwa/pwa-updater';
import { SyncProvider } from '../src/components/offline/SyncProvider';

export const metadata: Metadata = {
  title: 'TransformMyNotes',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'TransformMyNotes',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#FAF8F3',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AmplifyProvider />
        <NativeBridge />
        <PwaUpdater />
        <SyncProvider />
        {children}
      </body>
    </html>
  );
}
