import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'TransformMyNotes',
  description: 'Turn your handwritten notes into organized, searchable digital notebooks.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
