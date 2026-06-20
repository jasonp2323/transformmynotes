import { requireActiveUser } from '@/lib/require-user';
import { AiActivityProvider } from '@/src/components/activity/AiActivityProvider';
import { AiActivityIndicator } from '@/src/components/activity/AiActivityIndicator';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireActiveUser();
  return (
    <AiActivityProvider>
      {children}
      <AiActivityIndicator />
    </AiActivityProvider>
  );
}
