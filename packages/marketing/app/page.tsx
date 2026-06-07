const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '/auth/login';
const requestAccessHref = appUrl.startsWith('http') ? appUrl + '/auth/login' : appUrl;

export default function HomePage() {
  return (
    <main>
      <h1>TransformMyNotes</h1>
      <p>Turn your handwritten notes into organized, searchable digital notebooks.</p>
      <a href={requestAccessHref}>Request access</a>
    </main>
  );
}
