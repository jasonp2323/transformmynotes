import '../src/styles/globals.css';

import type { Metadata } from 'next';

// Favicon + apple-touch-icon are served via the Next.js file convention:
// app/icon.svg  → <link rel="icon" type="image/svg+xml" ...>  (auto-wired by Next.js)
// app/apple-icon.png → <link rel="apple-touch-icon" ...>       (auto-wired by Next.js)
// No explicit `icons` entry needed here; Next.js discovers them by filename.
export const metadata: Metadata = {
  title: 'TransformMyNotes — your handwriting, transformed',
  description: 'Turn your handwritten notes into organized, searchable digital notebooks.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      {/*
       * {children} is rendered directly inside <body>.
       * page.tsx always returns a <main> as its outermost element, so the
       * `body > main { position:relative; z-index:1; }` rule in globals.css
       * lifts page content above the body::before paper-grain wash (z-index:0)
       * — no extra wrapper div needed here.
       */}
      <body>{children}</body>
    </html>
  );
}
