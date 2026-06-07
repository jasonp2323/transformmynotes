// The real auth middleware lives in proxy.ts (project convention, see CLAUDE.md).
// Next.js only auto-loads `middleware.ts`, so this file re-exports it.
export { middleware, config } from './proxy';
