import { QuizTakingScreen } from '@/src/components/study/QuizTakingScreen';

export default function TakeQuizPage({ params }: { params: { studySetId: string } }) {
  return <QuizTakingScreen studySetId={params.studySetId} />;
}
