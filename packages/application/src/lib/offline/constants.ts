// SW runtime cache name for the read API (/api/notes*). Owned by the app; purged on sign-out.
export const READ_API_CACHE = 'tmn-read-api';
// IndexedDB database for offline read cache.
export const OFFLINE_DB_NAME = 'tmn-offline';
export const OFFLINE_DB_VERSION = 1;
// Object store names.
export const NOTE_LIST_STORE = 'noteList';
export const NOTE_STORE = 'notes';
// Any Cache API cache whose name starts with one of these is owned by us and
// is deleted on sign-out (covers READ_API_CACHE plus any future tmn- caches).
export const OWNED_CACHE_PREFIX = 'tmn-';
