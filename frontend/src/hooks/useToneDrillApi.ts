/**
 * Hook for tone drill API - all sampling and state management happens on the backend.
 */
import { useState, useCallback, useEffect } from 'react';
import { API_BASE_URL } from '../config';
import { authFetch } from '../services/authApi';

export type DifficultyLevel = '2-choice' | '4-choice' | 'multi-syllable';

export interface ToneDrill {
  word_id: number;
  vietnamese: string;
  english: string;
  correct_sequence: number[];  // 1-indexed
  alternatives: number[][];    // 1-indexed
}

export interface PairProbability {
  pair: number[];  // 0-indexed
  probability: number;
  attempts: number;
}

export interface FourChoiceProbability {
  set: number[];  // 0-indexed
  probability: number;
}

export interface DrillStats {
  reviews_today: number;
  correct_today: number;
  total_reviews: number;
  total_correct: number;
  pair_probabilities: PairProbability[];
  four_choice_probabilities: FourChoiceProbability[];
}

export interface PreviousAnswer {
  word_id: number;
  correct_sequence: number[];  // 1-indexed
  selected_sequence: number[];  // 1-indexed
  alternatives: number[][];    // 1-indexed
  response_time_ms?: number;
}

interface NextDrillResponse {
  drill: ToneDrill;
  difficulty_level: DifficultyLevel;
  stats: DrillStats;
}

const TONE_DRILL_URL = `${API_BASE_URL}/api/tone-drill/next`;

async function fetchNextDrill(previousAnswer?: PreviousAnswer): Promise<NextDrillResponse> {
  const response = await authFetch(TONE_DRILL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      previous_answer: previousAnswer ?? null,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch next drill: ${error}`);
  }

  return response.json();
}

export function useToneDrillApi() {
  const [drill, setDrill] = useState<ToneDrill | null>(null);
  const [stats, setStats] = useState<DrillStats | null>(null);
  const [difficultyLevel, setDifficultyLevel] = useState<DifficultyLevel>('2-choice');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Load initial drill on mount
  useEffect(() => {
    let mounted = true;

    async function loadInitial() {
      try {
        setIsLoading(true);
        setError(null);
        const response = await fetchNextDrill();
        if (mounted) {
          setDrill(response.drill);
          setStats(response.stats);
          setDifficultyLevel(response.difficulty_level);
        }
      } catch (e) {
        if (mounted) {
          setError(e instanceof Error ? e : new Error(String(e)));
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    loadInitial();

    return () => {
      mounted = false;
    };
  }, []);

  // Submit answer and get next drill
  const submitAnswer = useCallback(async (answer: PreviousAnswer): Promise<NextDrillResponse> => {
    const response = await fetchNextDrill(answer);
    setDrill(response.drill);
    setStats(response.stats);
    setDifficultyLevel(response.difficulty_level);
    return response;
  }, []);

  // Reload drill (without submitting an answer)
  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetchNextDrill();
      setDrill(response.drill);
      setStats(response.stats);
      setDifficultyLevel(response.difficulty_level);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    drill,
    stats,
    difficultyLevel,
    isLoading,
    error,
    submitAnswer,
    reload,
  };
}
