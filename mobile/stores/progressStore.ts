import { create } from 'zustand';
import { API_BASE_URL } from '../config';
import * as syncApi from '../services/syncApi';

interface ProgressState {
  reviewsToday: number;
  correctToday: number;
  lastReviewDate: string;
  totalReviews: number;
  totalCorrect: number;
  isLoading: boolean;
  isAuthenticated: boolean;

  loadProgress: () => Promise<void>;
  recordReview: (correct: boolean) => void;
  resetDailyStats: () => void;
  setAuthenticated: (authenticated: boolean) => void;
}

// Simple store without persist middleware (data comes from backend)
export const useProgress = create<ProgressState>()((set, get) => ({
  reviewsToday: 0,
  correctToday: 0,
  lastReviewDate: '',
  totalReviews: 0,
  totalCorrect: 0,
  isLoading: true,
  isAuthenticated: false,

  setAuthenticated: (authenticated: boolean) => {
    set({ isAuthenticated: authenticated });
  },

  loadProgress: async () => {
    try {
      const authenticated = await syncApi.isAuthenticated();
      set({ isAuthenticated: authenticated });

      if (authenticated) {
        // Use authenticated sync endpoint
        const data = await syncApi.getSyncData();
        set({
          reviewsToday: data.progress.reviews_today,
          correctToday: data.progress.correct_today,
          lastReviewDate: data.progress.last_review_date,
          totalReviews: data.progress.total_reviews,
          totalCorrect: data.progress.total_correct,
          isLoading: false,
        });
      } else {
        // Fall back to public endpoint
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

    // Save to backend
    if (state.isAuthenticated) {
      // Use authenticated sync endpoint
      syncApi.recordReview(correct).catch(e =>
        console.error('Failed to record progress:', e)
      );
    } else {
      // Fall back to public endpoint
      fetch(`${API_BASE_URL}/api/fsrs/progress/record`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correct }),
      }).catch(e => console.error('Failed to record progress:', e));
    }
  },

  resetDailyStats: () => {
    set({
      reviewsToday: 0,
      correctToday: 0,
    });
  },
}));

// Auto-load on first access
let hasLoadedFromBackend = false;
export const initializeProgress = async () => {
  if (!hasLoadedFromBackend) {
    hasLoadedFromBackend = true;
    await useProgress.getState().loadProgress();
  }
};
