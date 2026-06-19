// SW runtime cache name for the read API (/api/notes*). Owned by the app; purged on sign-out.
export const READ_API_CACHE = 'tmn-read-api';
// IndexedDB database for offline read cache + mutation/capture queues.
export const OFFLINE_DB_NAME = 'tmn-offline';
// Bump to 2 to add mutationQueue + captureQueue stores.
export const OFFLINE_DB_VERSION = 2;
// Object store names.
export const NOTE_LIST_STORE = 'noteList';
export const NOTE_STORE = 'notes';
export const MUTATION_QUEUE_STORE = 'mutationQueue';
export const CAPTURE_QUEUE_STORE = 'captureQueue';
// Any Cache API cache whose name starts with one of these is owned by us and
// is deleted on sign-out (covers READ_API_CACHE plus any future tmn- caches).
export const OWNED_CACHE_PREFIX = 'tmn-';
