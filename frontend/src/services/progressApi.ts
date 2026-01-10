import { API_BASE_URL } from '../config';
import { authFetch } from './authApi';
import type { ProgressStats } from '../types';

interface ProgressResponse {
  reviews_today: number;
  correct_today: number;
  last_review_date: string;
  total_reviews: number;
  total_correct: number;
}

export async function fetchProgress(): Promise<ProgressStats> {
  const response = await authFetch(`${API_BASE_URL}/api/progress`);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch progress: ${errorText}`);
  }

  const data: ProgressResponse = await response.json();
  return {
    reviewsToday: data.reviews_today,
    correctToday: data.correct_today,
    lastReviewDate: data.last_review_date,
    totalReviews: data.total_reviews,
    totalCorrect: data.total_correct,
  };
}

export async function recordReview(
  wordId: number,
  correct: boolean,
  timestamp?: number
): Promise<void> {
  const payload: { word_id: number; correct: boolean; timestamp?: number } = {
    word_id: wordId,
    correct,
  };
  if (timestamp !== undefined) {
    payload.timestamp = timestamp;
  }

  const response = await authFetch(`${API_BASE_URL}/api/reviews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to record review: ${errorText}`);
  }
}
