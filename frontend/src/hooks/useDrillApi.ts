/**
 * Unified hook for drill API - works with both tone and vowel drills.
 * All sampling and state management happens on the backend.
 */
import { useState, useCallback, useEffect } from 'react';
import { API_BASE_URL } from '../config';
import { authFetch } from '../services/authApi';

export type DrillType = 'tone' | 'vowel';
export type DifficultyLevel = '2-choice' | '4-choice' | 'multi-syllable';

export interface Drill {
  problem_type_id: string;
  word_id: number;
  vietnamese: string;
  english?: string;  // Optional - may not be returned by all endpoints
  correct_sequence: number[];  // 1-indexed
  alternatives: number[][];    // 1-indexed
}

export interface PairStats {
  pair: [number, number];  // 1-indexed
  alpha: number;
  beta: number;
  mean: number;
}

export interface StateUpdate {
  tracker_id: string;
  old_value: number;
  new_value: number;
}

export interface PreviousAnswer {
  problem_type_id: string;
  word_id: number;
  correct_sequence: number[];  // 1-indexed
  selected_sequence: number[];  // 1-indexed
  alternatives: number[][];    // 1-indexed
  response_time_ms?: number;
}

interface NextDrillResponse {
  drill: Drill;
  difficulty_level: DifficultyLevel;
  state_updates: StateUpdate[];
  pair_stats: PairStats[];
}

const DRILL_URL = `${API_BASE_URL}/api/drill/next`;

async function fetchNextDrill(
  drillType: DrillType,
  previousAnswer?: PreviousAnswer
): Promise<NextDrillResponse> {
  const response = await authFetch(DRILL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      drill_type: drillType,
      previous_answer: previousAnswer ?? null,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch next drill: ${error}`);
  }

  return response.json();
}

export function useDrillApi(drillType: DrillType) {
  const [drill, setDrill] = useState<Drill | null>(null);
  const [pairStats, setPairStats] = useState<PairStats[]>([]);
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
        const response = await fetchNextDrill(drillType);
        if (mounted) {
          setDrill(response.drill);
          setPairStats(response.pair_stats);
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
  }, [drillType]);

  // Submit answer and get next drill
  const submitAnswer = useCallback(
    async (answer: PreviousAnswer): Promise<NextDrillResponse> => {
      const response = await fetchNextDrill(drillType, answer);
      setDrill(response.drill);
      setPairStats(response.pair_stats);
      setDifficultyLevel(response.difficulty_level);
      return response;
    },
    [drillType]
  );

  // Reload drill (without submitting an answer)
  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetchNextDrill(drillType);
      setDrill(response.drill);
      setPairStats(response.pair_stats);
      setDifficultyLevel(response.difficulty_level);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setIsLoading(false);
    }
  }, [drillType]);

  // Helper to get pair probability from stats
  const getPairProbability = useCallback(
    (pair: [number, number]): number | null => {
      const stat = pairStats.find(
        (s) =>
          (s.pair[0] === pair[0] && s.pair[1] === pair[1]) ||
          (s.pair[0] === pair[1] && s.pair[1] === pair[0])
      );
      return stat?.mean ?? null;
    },
    [pairStats]
  );

  // Convert pair_stats to legacy format for backward compatibility
  const legacyPairProbabilities = pairStats.map((s) => ({
    pair: [s.pair[0] - 1, s.pair[1] - 1] as [number, number],  // Convert to 0-indexed
    probability: s.mean,
    correct: s.alpha,
    total: s.alpha + s.beta,
  }));

  return {
    drill,
    pairStats,
    difficultyLevel,
    isLoading,
    error,
    submitAnswer,
    reload,
    getPairProbability,
    // Legacy compatibility
    legacyPairProbabilities,
  };
}
