import { GeneratedMaterialsQueue } from '@/src/components/study/GeneratedMaterialsQueue';
import { parseStudySetIds } from '@/src/lib/review-queue';

interface ReviewPageProps {
  searchParams: { ids?: string };
}

export default function ReviewPage({ searchParams }: ReviewPageProps) {
  const parsedIds = parseStudySetIds(searchParams.ids);

  return <GeneratedMaterialsQueue ids={parsedIds} />;
}
