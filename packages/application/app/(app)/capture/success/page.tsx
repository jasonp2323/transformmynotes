import { redirect } from 'next/navigation';
import { SuccessScreen } from '@/src/components/states/SuccessScreen';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<{
    noteId?: string;
    title?: string;
    wordCount?: string;
    highlights?: string;
    langPair?: string;
    ocrConfidence?: string;
  }>;
}) {
  const params = await searchParams;
  const { noteId, title = '', langPair = '' } = params;

  if (!noteId) {
    redirect('/dashboard');
  }

  const highlights = Number(params.highlights) || 0;
  const words = Number(params.wordCount) || 0;
  const ocrConfidence = Number(params.ocrConfidence) || 0;

  return (
    <SuccessScreen
      noteId={noteId}
      title={title}
      highlights={highlights}
      words={words}
      langPair={langPair}
      ocrConfidence={ocrConfidence}
    />
  );
}
