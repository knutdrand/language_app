/**
 * Unified hook for drill API - works with tone drills.
 * All sampling and state management happens on the backend.
 */
import { useState, useCallback, useEffect } from 'react';
import { API_BASE_URL } from '../config';
import { authFetch } from '../services/authApi';

export type DrillType = 'tone';
export type DifficultyLevel = '2-choice' | 'mixed' | '4-choice-multi';

export interface Drill {
  problem_type_id: string;
  word_id: number;
  vietnamese: string;
  english?: string;
  correct_sequence: number[];  // 1-indexed
  alternatives: number[][];    // 1-indexed
  voice: string;               // Voice for audio playback
  speed: number;               // Speed for audio playback
}

export interface PairStats {
  pair: [number, number];  // 1-indexed
  alpha: number;
  beta: number;
  mean: number;
}

export interface FourChoiceStats {
  set: number[];  // 4 class IDs (1-indexed)
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
  vietnamese: string;          // Vietnamese text for logging
  correct_sequence: number[];  // 1-indexed
  selected_sequence: number[];  // 1-indexed
  alternatives: number[][];    // 1-indexed
  response_time_ms?: number;
  voice: string;               // Voice used for this drill
  speed: number;               // Speed used for this drill
}

interface NextDrillResponse {
  drill: Drill;
  difficulty_level: DifficultyLevel;
  state_updates: StateUpdate[];
  pair_stats: PairStats[];
  four_choice_stats: FourChoiceStats[];
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
  const [fourChoiceStats, setFourChoiceStats] = useState<FourChoiceStats[]>([]);
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
          setFourChoiceStats(response.four_choice_stats || []);
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
      setFourChoiceStats(response.four_choice_stats || []);
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
      setFourChoiceStats(response.four_choice_stats || []);
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

  return {
    drill,
    pairStats,
    fourChoiceStats,
    difficultyLevel,
    isLoading,
    error,
    submitAnswer,
    reload,
    getPairProbability,
  };
}
