/**
 * Shared types for usage metering and cost breakdown (M23).
 *
 * Design principle: persist quantities, derive dollars.
 * Only physical quantities (tokens, bytes) are stored in DynamoDB. Dollar
 * amounts are computed at read-time from an admin-editable PriceBook so that
 * rate changes are reflected retroactively without re-writing stored records.
 */

/** Per-model token rates, in USD per 1,000 tokens. */
export interface ModelPrice {
  inputPer1k: number;
  outputPer1k: number;
}

/**
 * Admin-editable price book. Stored as the CONFIG/PRICING item; read at
 * query time so rate updates are applied retroactively to all stored records.
 */
export interface PriceBook {
  /**
   * modelId → token rates. Unknown model ids (e.g. a model we started using
   * after the price book was last updated) fall back to `defaultModel`.
   */
  models: Record<string, ModelPrice>;
  /**
   * Fallback rate for any model id not present in `models`.
   * Guards against unpriced-model surprises — surfaces via `unpriced: true`.
   */
  defaultModel: ModelPrice;
  /** S3 storage cost rate in USD per GB-month. */
  s3PerGbMonth: number;
}

/**
 * A normalized AI daily-aggregate record.
 * One item per (user, day, feature, model) combination.
 */
export interface DailyAiAggregate {
  /** Cognito sub of the user who incurred the cost. */
  sub: string;
  /** UTC date string in YYYY-MM-DD format. */
  day: string;
  /** Feature / call-site identifier (e.g. "flashcards", "quiz", "ocr"). */
  feature: string;
  /** Bedrock model id used for this aggregate. */
  model: string;
  /** Total input tokens consumed. */
  inputTokens: number;
  /** Total output tokens generated. */
  outputTokens: number;
  /** Total number of API calls made. */
  calls: number;
}

/**
 * A normalized storage daily-snapshot record.
 * One item per (user, day), recording the user's total stored bytes at the
 * end of that day (or at snapshot time). Used to approximate GB-months.
 */
export interface DailyStorageAggregate {
  /** Cognito sub of the user whose storage was measured. */
  sub: string;
  /** UTC date string in YYYY-MM-DD format. */
  day: string;
  /**
   * Total bytes stored by this user at snapshot time.
   * Named `byteDayBytes` so the unit (bytes, at day granularity) is
   * unambiguous when used in GB-month calculations.
   */
  byteDayBytes: number;
}
