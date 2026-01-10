import { useCallback, useEffect, useState } from 'react';
import type { ProgressStats } from '../types';
import { fetchProgress, recordReview as apiRecordReview } from '../services/progressApi';

function getUtcDateString(timestampMs: number): string {
  return new Date(timestampMs).toISOString().slice(0, 10);
}

function applyReviewToProgress(
  prev: ProgressStats | null,
  correct: boolean,
  timestampMs: number
): ProgressStats {
  const today = getUtcDateString(timestampMs);

  if (!prev) {
    return {
      reviewsToday: 1,
      correctToday: correct ? 1 : 0,
      lastReviewDate: today,
      totalReviews: 1,
      totalCorrect: correct ? 1 : 0,
    };
  }

  const sameDay = prev.lastReviewDate === today;
  const reviewsToday = sameDay ? prev.reviewsToday + 1 : 1;
  const correctToday = sameDay ? prev.correctToday + (correct ? 1 : 0) : (correct ? 1 : 0);

  return {
    reviewsToday,
    correctToday,
    lastReviewDate: today,
    totalReviews: prev.totalReviews + 1,
    totalCorrect: prev.totalCorrect + (correct ? 1 : 0),
  };
}

export function useProgress() {
  const [progress, setProgress] = useState<ProgressStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchProgress();
      setProgress(data);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const recordReview = useCallback(
    async (wordId: number, correct: boolean, timestampMs = Date.now()) => {
      if (wordId <= 0) {
        return;
      }
      try {
        await apiRecordReview(wordId, correct, timestampMs);
        let needsRefresh = false;
        setProgress((prev) => {
          if (!prev) {
            needsRefresh = true;
            return applyReviewToProgress(null, correct, timestampMs);
          }
          return applyReviewToProgress(prev, correct, timestampMs);
        });
        if (needsRefresh) {
          void refresh();
        }
      } catch (e) {
        console.error('Failed to record review:', e);
        setError(e instanceof Error ? e : new Error(String(e)));
      }
    },
    [refresh]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    progress,
    isLoading,
    error,
    refresh,
    recordReview,
  };
}
