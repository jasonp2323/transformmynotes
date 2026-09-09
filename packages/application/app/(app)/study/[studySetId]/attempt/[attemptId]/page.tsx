import { AttemptReportScreen } from '@/src/components/study/AttemptReportScreen';

export default async function AttemptReportPage({
  params,
}: {
  params: Promise<{ studySetId: string; attemptId: string }>;
}) {
  const { studySetId, attemptId } = await params;
  return (
    <AttemptReportScreen studySetId={studySetId} attemptId={attemptId} />
  );
}
