/**
 * Hook for vowel drill API - all sampling and state management happens on the backend.
 */
import { useState, useCallback, useEffect } from 'react';
import { API_BASE_URL } from '../config';
import { authFetch } from '../services/authApi';

export type VowelDifficultyLevel = '2-choice' | '4-choice' | 'multi-syllable';

export interface VowelDrill {
  word_id: number;
  vietnamese: string;
  english: string;
  correct_sequence: number[];  // 1-indexed
  alternatives: number[][];    // 1-indexed
}

export interface VowelPairProbability {
  pair: number[];  // 0-indexed
  probability: number;
  correct: number;
  total: number;
}

export interface VowelDrillStats {
  reviews_today: number;
  correct_today: number;
  total_reviews: number;
  total_correct: number;
  pair_probabilities: VowelPairProbability[];
}

export interface VowelPreviousAnswer {
  word_id: number;
  correct_sequence: number[];  // 1-indexed
  selected_sequence: number[];  // 1-indexed
  alternatives: number[][];    // 1-indexed
  response_time_ms?: number;
}

interface VowelNextDrillResponse {
  drill: VowelDrill;
  difficulty_level: VowelDifficultyLevel;
  stats: VowelDrillStats;
}

const VOWEL_DRILL_URL = `${API_BASE_URL}/api/vowel-drill/next`;

async function fetchNextVowelDrill(previousAnswer?: VowelPreviousAnswer): Promise<VowelNextDrillResponse> {
  const response = await authFetch(VOWEL_DRILL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      previous_answer: previousAnswer ?? null,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch next vowel drill: ${error}`);
  }

  return response.json();
}

export function useVowelDrillApi() {
  const [drill, setDrill] = useState<VowelDrill | null>(null);
  const [stats, setStats] = useState<VowelDrillStats | null>(null);
  const [difficultyLevel, setDifficultyLevel] = useState<VowelDifficultyLevel>('2-choice');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Load initial drill on mount
  useEffect(() => {
    let mounted = true;

    async function loadInitial() {
      try {
        setIsLoading(true);
        setError(null);
        const response = await fetchNextVowelDrill();
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
  const submitAnswer = useCallback(async (answer: VowelPreviousAnswer): Promise<VowelNextDrillResponse> => {
    const response = await fetchNextVowelDrill(answer);
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
      const response = await fetchNextVowelDrill();
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
