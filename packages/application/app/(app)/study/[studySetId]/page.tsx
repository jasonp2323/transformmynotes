import { StudySetViewerScreen } from '@/src/components/study/StudySetViewerScreen';

export default async function StudySetPage({ params }: { params: Promise<{ studySetId: string }> }) {
  const { studySetId } = await params;
  return <StudySetViewerScreen studySetId={studySetId} />;
}
