import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ProgressState {
  reviewsToday: number;
  correctToday: number;
  lastReviewDate: string;
  totalReviews: number;
  totalCorrect: number;

  recordReview: (correct: boolean) => void;
  resetDailyStats: () => void;
}

const getTodayString = () => new Date().toDateString();

export const useProgress = create<ProgressState>()(
  persist(
    (set, get) => ({
      reviewsToday: 0,
      correctToday: 0,
      lastReviewDate: getTodayString(),
      totalReviews: 0,
      totalCorrect: 0,

      recordReview: (correct: boolean) => {
        const today = getTodayString();
        const state = get();

        // Reset daily stats if it's a new day
        if (state.lastReviewDate !== today) {
          set({
            reviewsToday: 1,
            correctToday: correct ? 1 : 0,
            lastReviewDate: today,
            totalReviews: state.totalReviews + 1,
            totalCorrect: state.totalCorrect + (correct ? 1 : 0),
          });
        } else {
          set({
            reviewsToday: state.reviewsToday + 1,
            correctToday: state.correctToday + (correct ? 1 : 0),
            totalReviews: state.totalReviews + 1,
            totalCorrect: state.totalCorrect + (correct ? 1 : 0),
          });
        }
      },

      resetDailyStats: () => {
        set({
          reviewsToday: 0,
          correctToday: 0,
          lastReviewDate: getTodayString(),
        });
      },
    }),
    {
      name: 'language_app_progress',
    }
  )
);
