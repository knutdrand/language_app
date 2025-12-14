import type { Card } from 'ts-fsrs';

export interface Word {
  id: number;
  vietnamese: string;
  english: string;
  imageUrl: string;
}

export interface CardState {
  wordId: number;
  card: Card;
}

export interface ReviewResult {
  wordId: number;
  correct: boolean;
  timestamp: number;
}

export interface SessionStats {
  reviewsToday: number;
  correctToday: number;
  lastReviewDate: string;
}
