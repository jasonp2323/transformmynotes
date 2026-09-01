// Constants
export {
  READ_API_CACHE,
  OFFLINE_DB_NAME,
  OFFLINE_DB_VERSION,
  NOTE_LIST_STORE,
  NOTE_STORE,
  MUTATION_QUEUE_STORE,
  CAPTURE_QUEUE_STORE,
  OWNED_CACHE_PREFIX,
} from './constants';

// Auth sub helper
export { getCurrentUserSub } from './sub';

// Shared DB opener
export { getOfflineDB } from './db';

// IndexedDB read store — types + functions
export type { CachedNoteList, CachedNote } from './readStore';
export {
  cacheNoteList,
  readNoteList,
  cacheNote,
  readNote,
  clearOfflineReadStore,
} from './readStore';

// Mutation queue — offline note edits (M22.3.1)
export type { QueuedMutation, ReplayMutationsDeps, ReplayMutationsSummary } from './mutationQueue';
export {
  enqueueMutation,
  listMutations,
  deleteMutation,
  updateMutation,
  countMutations,
  replayMutations,
} from './mutationQueue';

// Capture queue — offline photo uploads (M22.3.3)
export type { QueuedCapture, ReplayCapturesDeps, ReplayCapturesSummary } from './captureQueue';
export {
  enqueueCapture,
  listCaptures,
  deleteCapture,
  countCaptures,
  replayCaptures,
} from './captureQueue';

// Purge helper (sign-out)
export { purgeOfflineCaches } from './purge';
