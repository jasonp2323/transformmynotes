import { GeneratedMaterialsQueue } from '@/src/components/study/GeneratedMaterialsQueue';
import { parseStudySetIds } from '@/src/lib/review-queue';

interface ReviewPageProps {
  searchParams: Promise<{ ids?: string }>;
}

export default async function ReviewPage({ searchParams }: ReviewPageProps) {
  const { ids } = await searchParams;
  const parsedIds = parseStudySetIds(ids);

  return <GeneratedMaterialsQueue ids={parsedIds} />;
}
