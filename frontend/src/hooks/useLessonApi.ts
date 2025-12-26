/**
 * Hook for lesson-based drill API.
 * Manages lesson session state and drill progression.
 */
import { useState, useCallback } from 'react';
import { API_BASE_URL } from '../config';
import { authFetch } from '../services/authApi';

export type LessonPhase = 'learning' | 'review' | 'complete';
export type DrillMode = '2-choice-1syl' | '4-choice-1syl' | '2-choice-2syl';

export interface LessonProgress {
  phase: LessonPhase;
  current: number;
  total: number;
}

export interface LessonDrill {
  problem_type_id: string;
  word_id: number;
  vietnamese: string;
  english: string;
  correct_sequence: number[];
  alternatives: number[][];
  voice: string;
  speed: number;
  mode: DrillMode;
  progress: LessonProgress;
}

export interface LessonSummary {
  lesson_id: number;
  theme_id: number;
  theme_pairs: [number, number][];
  total_drills: number;
  mistakes_count: number;
  accuracy: number;
}

export interface LessonSession {
  session_id: string;
  lesson_id: number;
  theme_id: number;
  theme_pairs: [number, number][];
  total_drills: number;
}

export interface ThemeInfo {
  id: number;
  pairs: [number, number][];
}

interface StartLessonResponse {
  session_id: string;
  lesson_id: number;
  theme_id: number;
  theme_pairs: [number, number][];
  total_drills: number;
}

interface LessonNextResponse {
  drill: LessonDrill | null;
  is_complete: boolean;
  summary: LessonSummary | null;
}

interface ThemesResponse {
  themes: ThemeInfo[];
}

export function useLessonApi() {
  const [session, setSession] = useState<LessonSession | null>(null);
  const [drill, setDrill] = useState<LessonDrill | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [summary, setSummary] = useState<LessonSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const startLesson = useCallback(async (themeId?: number) => {
    setIsLoading(true);
    setError(null);
    setIsComplete(false);
    setSummary(null);

    try {
      // Start lesson
      const startRes = await authFetch(`${API_BASE_URL}/api/lesson/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme_id: themeId ?? null }),
      });

      if (!startRes.ok) {
        const errorText = await startRes.text();
        throw new Error(`Failed to start lesson: ${errorText}`);
      }

      const sessionData: StartLessonResponse = await startRes.json();
      const newSession: LessonSession = {
        session_id: sessionData.session_id,
        lesson_id: sessionData.lesson_id,
        theme_id: sessionData.theme_id,
        theme_pairs: sessionData.theme_pairs,
        total_drills: sessionData.total_drills,
      };
      setSession(newSession);

      // Get first drill
      const firstRes = await authFetch(
        `${API_BASE_URL}/api/lesson/first/${sessionData.session_id}`
      );

      if (!firstRes.ok) {
        const errorText = await firstRes.text();
        throw new Error(`Failed to get first drill: ${errorText}`);
      }

      const { drill: firstDrill, is_complete }: LessonNextResponse = await firstRes.json();
      setDrill(firstDrill);
      setIsComplete(is_complete);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const submitAnswer = useCallback(
    async (selectedSequence: number[], responseTimeMs?: number) => {
      if (!session || !drill) return;

      setIsLoading(true);

      try {
        const res = await authFetch(`${API_BASE_URL}/api/lesson/next`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: session.session_id,
            word_id: drill.word_id,
            vietnamese: drill.vietnamese,
            correct_sequence: drill.correct_sequence,
            selected_sequence: selectedSequence,
            alternatives: drill.alternatives,
            response_time_ms: responseTimeMs,
            voice: drill.voice,
            speed: drill.speed,
            mode: drill.mode,
          }),
        });

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`Failed to submit answer: ${errorText}`);
        }

        const {
          drill: nextDrill,
          is_complete,
          summary: lessonSummary,
        }: LessonNextResponse = await res.json();

        setDrill(nextDrill);
        setIsComplete(is_complete);
        setSummary(lessonSummary);
      } catch (e) {
        setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        setIsLoading(false);
      }
    },
    [session, drill]
  );

  const resetLesson = useCallback(() => {
    setSession(null);
    setDrill(null);
    setIsComplete(false);
    setSummary(null);
    setError(null);
  }, []);

  return {
    session,
    drill,
    isComplete,
    summary,
    isLoading,
    error,
    startLesson,
    submitAnswer,
    resetLesson,
  };
}

export async function fetchLessonThemes(): Promise<ThemeInfo[]> {
  const res = await authFetch(`${API_BASE_URL}/api/lesson/themes`);
  if (!res.ok) {
    throw new Error('Failed to fetch lesson themes');
  }
  const data: ThemesResponse = await res.json();
  return data.themes;
}
