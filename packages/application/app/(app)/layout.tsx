import { requireActiveUser } from '@/lib/require-user';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireActiveUser();
  return <>{children}</>;
}
