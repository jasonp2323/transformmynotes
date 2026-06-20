export interface ProgressProfile {
  studyStreakDays: number;
  longestStreakDays: number;
  lastStudyDay: string | null;
  totalReviewsLifetime: number;
  totalCardsMastered: number;
  totalQuizAttemptsLifetime: number;
}

export interface DaySnapshot {
  date: string;
  reviews: number;
  cardsReviewed: number;
  correctReviews: number;
  quizAttempts: number;
  notesCreated: number;
  studySetsCreated: number;
  cardsMastered: number;
  retentionRate: number | null;
  avgQuizScore: number | null;
  avgEase: number | null;
}

export interface ProgressTotals {
  reviews: number;
  correctReviews: number;
  quizAttempts: number;
  notesCreated: number;
  studySetsCreated: number;
  cardsMastered: number;
  retentionRate: number | null;
  avgQuizScore: number | null;
  avgEase: number | null;
}

export interface ProgressResponse {
  range: string;
  profile: ProgressProfile;
  days: DaySnapshot[];
  totals: ProgressTotals;
}

export type RangeOption = '7d' | '30d' | '90d' | '365d';
