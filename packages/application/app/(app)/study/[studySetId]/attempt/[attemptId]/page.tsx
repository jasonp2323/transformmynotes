import { AttemptReportScreen } from '@/src/components/study/AttemptReportScreen';

export default function AttemptReportPage({
  params,
}: {
  params: { studySetId: string; attemptId: string };
}) {
  return (
    <AttemptReportScreen studySetId={params.studySetId} attemptId={params.attemptId} />
  );
}
