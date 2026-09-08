import { QuizTakingScreen } from '@/src/components/study/QuizTakingScreen';

export default async function TakeQuizPage({ params }: { params: Promise<{ studySetId: string }> }) {
  const { studySetId } = await params;
  return <QuizTakingScreen studySetId={studySetId} />;
}
