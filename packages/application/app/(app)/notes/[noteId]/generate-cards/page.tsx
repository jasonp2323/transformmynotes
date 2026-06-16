import { GenerateCardsScreen } from '@/src/components/note/GenerateCardsScreen';

export default function Page({ params }: { params: { noteId: string } }) {
  return <GenerateCardsScreen noteId={params.noteId} />;
}
