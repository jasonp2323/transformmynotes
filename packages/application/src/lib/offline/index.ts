// Constants
export {
  READ_API_CACHE,
  OFFLINE_DB_NAME,
  OFFLINE_DB_VERSION,
  NOTE_LIST_STORE,
  NOTE_STORE,
  OWNED_CACHE_PREFIX,
} from './constants';

// Auth sub helper
export { getCurrentUserSub } from './sub';

// IndexedDB read store — types + functions
export type { CachedNoteList, CachedNote } from './readStore';
export {
  cacheNoteList,
  readNoteList,
  cacheNote,
  readNote,
  clearOfflineReadStore,
} from './readStore';

// Purge helper (sign-out)
export { purgeOfflineCaches } from './purge';
