import { useCallback } from 'react';
import { API_BASE_URL } from '../config';
import type { ToneId } from '../utils/tones';

interface ToneAttemptData {
  wordId: number;
  vietnamese: string;
  english: string;
  correctSequence: ToneId[];
  selectedSequence: ToneId[];
  alternatives: ToneId[][];
  isCorrect: boolean;
  responseTimeMs?: number;
}

interface DrillAttemptData {
  wordId: number;
  vietnamese: string;
  english: string;
  correctImageId: number;
  selectedImageId: number;
  alternativeWordIds: number[];
  isCorrect: boolean;
  responseTimeMs?: number;
}

async function postAttempt(endpoint: string, data: Record<string, unknown>): Promise<void> {
  try {
    const response = await fetch(`${API_BASE_URL}/api${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      console.warn(`Failed to log attempt: ${response.status}`);
    }
  } catch (error) {
    // Don't let logging failures break the app
    console.warn('Failed to log attempt:', error);
  }
}

/**
 * Hook for logging drill attempts to the backend for analysis.
 *
 * Logs are fire-and-forget - failures don't affect the user experience.
 */
export function useAttemptLog() {
  const logToneAttempt = useCallback((data: ToneAttemptData): void => {
    const payload = {
      timestamp: new Date().toISOString(),
      word_id: data.wordId,
      vietnamese: data.vietnamese,
      english: data.english,
      correct_sequence: data.correctSequence,
      selected_sequence: data.selectedSequence,
      alternatives: data.alternatives,
      is_correct: data.isCorrect,
      response_time_ms: data.responseTimeMs,
    };

    // Fire and forget - don't await
    postAttempt('/attempts/tone', payload);
  }, []);

  const logDrillAttempt = useCallback((data: DrillAttemptData): void => {
    const payload = {
      timestamp: new Date().toISOString(),
      word_id: data.wordId,
      vietnamese: data.vietnamese,
      english: data.english,
      correct_image_id: data.correctImageId,
      selected_image_id: data.selectedImageId,
      alternative_word_ids: data.alternativeWordIds,
      is_correct: data.isCorrect,
      response_time_ms: data.responseTimeMs,
    };

    // Fire and forget - don't await
    postAttempt('/attempts/drill', payload);
  }, []);

  return {
    logToneAttempt,
    logDrillAttempt,
  };
}
