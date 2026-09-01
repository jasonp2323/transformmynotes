export * from './db/client';
export * from './db/keys';
export * from './db/access-requests';
export * from './db/groups';
export * from './db/invites';
export * from './db/notes';
export * from './db/rate-limit';
export * from './db/shares';
export * from './db/cards';
export * from './db/quiz-attempts';
export * from './db/study';
export * from './db/activity';
export * from './db/transcription-jobs';
export * from './db/uploads';
export * from './db/ai-config';
export * from './db/users';
export * from './db/sources';

// Source resolution (M20)
export * from './sources/resolve';
export * from './sources/guardrails';
export * from './sources/parse';
export * from './sources/safe-fetch';
export * from './sources/web-extract';
export * from './sources/rate-window';
export * from './auth/invite';
export * from './auth/profile';
export * from './auth/access-request';
export * from './ocr/bedrock';
export * from './ocr/postprocess';
export * from './ocr/retry';
export * from './ocr/stitch';

// Text-to-speech (M18) — withPollyRetry is intentionally NOT re-exported
// (it stays internal to polly.ts; consumers only need synthesizeSpeech + audioHash).
export * from './tts/polly';
export * from './tts/hash';
export * from './tts/voices';
export * from './editor/serialize';
export * from './editor/utils';

// Search utilities
export * from './search/tokenise';

// Spaced-repetition (SRS) — pure logic
export * from './srs/scheduler';
export * from './srs/extract';

// AI study-material generation (M13)
export * from './study/types';
export * from './study/default-prompts';
export * from './study/config';
export * from './study/generate';
export * from './study/quiz';
export * from './study/flashcards';
export * from './study/judgeShortAnswer';
export * from './study/grading';
export * from './study/tokenBudget';
export * from './study/chunk';
export * from './study/dedup';
export * from './study/provenance';
export * from './study/learner-context';

// Study progress event log (M25)
export * from './db/progress';
export * from './db/progress-aggregate';

// Usage metering — pure cost math + price book (M23)
export * from './usage/types';
export * from './usage/price-book';
export * from './usage/cost';
export * from './usage/reducers';
export * from './usage/capture';
export * from './usage/range';
export * from './db/usage';
