import { GenerateCardsScreen } from '@/src/components/note/GenerateCardsScreen';

export default async function Page({ params }: { params: Promise<{ noteId: string }> }) {
  const { noteId } = await params;
  return <GenerateCardsScreen noteId={noteId} />;
}
