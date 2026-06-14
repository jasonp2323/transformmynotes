import type { Viewport } from 'next';
import '../src/styles/globals.css';
import { AmplifyProvider } from './amplify-provider';
import { NativeBridge } from './native-bridge';

export const metadata = { title: 'TransformMyNotes' };

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
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
        {children}
      </body>
    </html>
  );
}
