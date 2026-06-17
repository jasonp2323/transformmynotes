import { GenerateCardsScreen } from '@/src/components/note/GenerateCardsScreen';

export default function ReviewCardsPage({
  params,
  searchParams,
}: {
  params: { studySetId: string };
  searchParams?: { returnTo?: string };
}) {
  return (
    <GenerateCardsScreen
      studySetId={params.studySetId}
      returnTo={searchParams?.returnTo}
    />
  );
}
