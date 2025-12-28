import type { Card } from 'ts-fsrs';

export interface Word {
  id: number;
  vietnamese: string;
  english: string;
  imageUrl: string;
  sourceId?: string;
  frequency?: number;
}

export interface Source {
  id: string;
  title: string;
  url: string;
  description: string;
  topics: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  wordCount: number;
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

export interface ProgressStats {
  reviewsToday: number;
  correctToday: number;
  lastReviewDate: string;
  totalReviews: number;
  totalCorrect: number;
}

export type DrillMode = 'tone' | 'speak' | 'lesson';
