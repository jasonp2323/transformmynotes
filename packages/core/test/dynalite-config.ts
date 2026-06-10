/**
 * Shared constants for the dynalite integration test harness.
 *
 * Both `dynalite-global.ts` (vitest globalSetup, runs in the main process) and
 * `integration-env.ts` (vitest setupFiles, runs in each worker process) import
 * from here. Because env vars set in globalSetup do NOT propagate to workers,
 * sharing a constant is the robust way to guarantee both processes agree on the
 * port and table name.
 */

export const DYNALITE_PORT = Number(process.env.DYNALITE_PORT) || 4569;
export const DYNALITE_ENDPOINT = `http://127.0.0.1:${DYNALITE_PORT}`;
export const USER_DATA_TABLE = 'UserData';
export const INVITES_TABLE = 'Invites';
export const GROUPS_TABLE = 'Groups';
export const NOTES_TABLE = 'Notes';
