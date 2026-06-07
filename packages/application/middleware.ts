// The real auth middleware lives in proxy.ts (project convention, see CLAUDE.md).
// Next.js only auto-loads `middleware.ts`, so this file re-exports it.
// NOTE: config.matcher must be declared here (Next.js static analysis cannot
//       follow re-exports across modules when determining which routes to match).
export { middleware } from './proxy';

export const config = {
  matcher: ['/dashboard/:path*', '/app/:path*'],
};
