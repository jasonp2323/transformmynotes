import '../src/styles/globals.css';
import { AmplifyProvider } from './amplify-provider';

export const metadata = { title: 'TransformMyNotes' };

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AmplifyProvider />
        {children}
      </body>
    </html>
  );
}
