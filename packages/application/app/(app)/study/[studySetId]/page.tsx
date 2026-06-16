import { StudySetViewerScreen } from '@/src/components/study/StudySetViewerScreen';

export default function StudySetPage({ params }: { params: { studySetId: string } }) {
  return <StudySetViewerScreen studySetId={params.studySetId} />;
}
