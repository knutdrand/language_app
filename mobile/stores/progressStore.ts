import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../config';

interface ProgressState {
  reviewsToday: number;
  correctToday: number;
  lastReviewDate: string;
  totalReviews: number;
  totalCorrect: number;
  isLoading: boolean;

  loadProgress: () => Promise<void>;
  recordReview: (correct: boolean) => void;
  resetDailyStats: () => void;
}

export const useProgress = create<ProgressState>()(
  persist(
    (set, get) => ({
      reviewsToday: 0,
      correctToday: 0,
      lastReviewDate: '',
      totalReviews: 0,
      totalCorrect: 0,
      isLoading: true,

      loadProgress: async () => {
        try {
          const response = await fetch(`${API_BASE_URL}/api/fsrs/progress`);
          if (response.ok) {
            const data = await response.json();
            set({
              reviewsToday: data.reviews_today,
              correctToday: data.correct_today,
              lastReviewDate: data.last_review_date,
              totalReviews: data.total_reviews,
              totalCorrect: data.total_correct,
              isLoading: false,
            });
          } else {
            set({ isLoading: false });
          }
        } catch (e) {
          console.error('Failed to load progress from backend:', e);
          set({ isLoading: false });
        }
      },

      recordReview: (correct: boolean) => {
        const state = get();

        // Optimistic update
        set({
          reviewsToday: state.reviewsToday + 1,
          correctToday: state.correctToday + (correct ? 1 : 0),
          totalReviews: state.totalReviews + 1,
          totalCorrect: state.totalCorrect + (correct ? 1 : 0),
        });

        // Save to backend (fire and forget)
        fetch(`${API_BASE_URL}/api/fsrs/progress/record`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ correct }),
        }).catch(e => console.error('Failed to record progress:', e));
      },

      resetDailyStats: () => {
        set({
          reviewsToday: 0,
          correctToday: 0,
        });
      },
    }),
    {
      name: 'progress-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        reviewsToday: state.reviewsToday,
        correctToday: state.correctToday,
        lastReviewDate: state.lastReviewDate,
        totalReviews: state.totalReviews,
        totalCorrect: state.totalCorrect,
      }),
    }
  )
);

// Auto-load on first access
let hasLoadedFromBackend = false;
export const initializeProgress = async () => {
  if (!hasLoadedFromBackend) {
    hasLoadedFromBackend = true;
    await useProgress.getState().loadProgress();
  }
};
