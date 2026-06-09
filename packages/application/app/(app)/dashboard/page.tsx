import { cookies } from 'next/headers';
import { verifyIdToken } from '@/lib/verify-id-token';
import { AppShell } from '@/src/components/shells';
import { NoteCard, HighlightText } from '@/src/components/ui';
import type { NoteCardProps } from '@/src/components/ui';

const SAMPLE_NOTES: NoteCardProps[] = [
  {
    course: 'Spanish 201',
    title: 'The subjunctive mood',
    snippet:
      'El <mark>subjuntivo</mark> expresses doubt, desire and possibility across three verb patterns.',
    tags: ['subjunctive', 'verbs'],
    highlights: 12,
    words: 1204,
    status: 'clean',
    when: 'Today · 2:14 PM',
  },
  {
    course: 'Spanish 201',
    title: 'Ser vs. estar',
    snippet:
      'Use <mark>ser</mark> for identity and essence; <mark>estar</mark> for state and location.',
    tags: ['grammar', 'B1'],
    highlights: 8,
    words: 642,
    status: 'clean',
    when: 'Yesterday',
  },
  {
    course: 'Vocab journal',
    title: 'Market day words',
    snippet:
      "la sandía, el aguacate, la calabaza — produce gathered from Saturday's notes.",
    tags: ['vocab', 'food'],
    highlights: 5,
    words: 318,
    status: 'original',
    when: 'Sat · 11:02 AM',
  },
  {
    course: 'Spanish 201',
    title: 'Preterite vs. imperfect',
    snippet:
      'The <mark>pretérito</mark> marks completed actions; the imperfect paints the background.',
    tags: ['past-tense', 'verbs'],
    highlights: 9,
    words: 880,
    status: 'clean',
    when: 'Thu',
  },
  {
    course: 'Conversation',
    title: 'Por vs. para — quick rules',
    snippet:
      '<mark>Por</mark> for cause and exchange; <mark>para</mark> for purpose and destination.',
    tags: ['prepositions'],
    highlights: 6,
    words: 410,
    status: 'clean',
    when: 'Mon',
  },
];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { forbidden?: string };
}) {
  const token = cookies().get('CognitoIdToken')?.value;
  let who = 'there';
  if (token) {
    try {
      const claims = await verifyIdToken(token);
      who =
        (claims.email as string | undefined) ??
        (claims['cognito:username'] as string | undefined) ??
        'there';
    } catch {
      /* middleware should have redirected; fall through */
    }
  }

  return (
    <AppShell active="library" title="Library" userName={who}>
      <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-5xl mx-auto">
        {searchParams.forbidden === '1' && (
          <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            You don&apos;t have access to the admin area.
          </div>
        )}
        <div className="mb-6">
          <h1 className="font-serif text-2xl font-semibold text-text-strong mb-1">
            Welcome back, {who}
          </h1>
          <p className="text-text-muted">
            You have{' '}
            <HighlightText variant="teal">9 cards</HighlightText>{' '}
            waiting in your review deck.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {SAMPLE_NOTES.map((note, i) => (
            <NoteCard key={note.title ?? i} {...note} />
          ))}
        </div>
      </div>
    </AppShell>
  );
}
