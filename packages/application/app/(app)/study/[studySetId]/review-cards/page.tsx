import { GenerateCardsScreen } from '@/src/components/note/GenerateCardsScreen';

export default async function ReviewCardsPage({
  params,
  searchParams,
}: {
  params: Promise<{ studySetId: string }>;
  searchParams?: Promise<{ returnTo?: string }>;
}) {
  const { studySetId } = await params;
  const resolvedSearchParams = await searchParams;
  return (
    <GenerateCardsScreen
      studySetId={studySetId}
      returnTo={resolvedSearchParams?.returnTo}
    />
  );
}
