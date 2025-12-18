import { useCallback, useMemo, useState, useEffect } from 'react';
import { createEmptyCard, fsrs, Rating, type Card, type FSRSParameters } from 'ts-fsrs';
import type { Word } from '../types';
import { getToneSequence, getToneSequenceKey } from '../utils/tones';
import { getFrequencyWeight } from '../data/toneFrequencies';
import { API_BASE_URL } from '../config';
import * as syncApi from '../services/syncApi';

/**
 * Mastery thresholds for progressive unlocking.
 */
const MASTERY_THRESHOLD = 0.70;
const MIN_ATTEMPTS_FOR_MASTERY = 10;

/**
 * Custom FSRS parameters optimized for skill training (shorter intervals).
 */
const SKILL_TRAINING_PARAMS: Partial<FSRSParameters> = {
  w: [
    0.4, 0.6, 2.4, 5.8,
    4.93, 0.94, 0.86, 0.01,
    1.49, 0.14, 0.94, 2.18,
    0.05, 0.34, 1.26, 0.29, 2.61
  ],
  request_retention: 0.85,
  maximum_interval: 3,
};

const f = fsrs(SKILL_TRAINING_PARAMS);

interface ToneCardState {
  sequenceKey: string;
  card: Card;
  correct: number;
  total: number;
}

interface BackendCardState {
  sequence_key: string;
  card: {
    due: string;
    stability: number;
    difficulty: number;
    elapsed_days: number;
    scheduled_days: number;
    reps: number;
    lapses: number;
    state: number;
    last_review?: string;
  };
  correct: number;
  total: number;
}

interface WordWithSequence {
  word: Word;
  sequenceKey: string;
}

function fromBackend(backend: BackendCardState): ToneCardState {
  return {
    sequenceKey: backend.sequence_key,
    card: {
      ...backend.card,
      due: new Date(backend.card.due),
      last_review: backend.card.last_review ? new Date(backend.card.last_review) : undefined,
    } as Card,
    correct: backend.correct,
    total: backend.total,
  };
}

function toBackend(state: ToneCardState): BackendCardState {
  return {
    sequence_key: state.sequenceKey,
    card: {
      ...state.card,
      due: state.card.due.toISOString(),
      last_review: state.card.last_review?.toISOString(),
    } as BackendCardState['card'],
    correct: state.correct,
    total: state.total,
  };
}

function getSyllableCount(sequenceKey: string): number {
  return sequenceKey.split('-').length;
}

function isSyllableLevelUnlocked(
  targetSyllables: number,
  cardStates: Map<string, ToneCardState>
): boolean {
  if (targetSyllables <= 1) return true;

  const prevSyllables = targetSyllables - 1;
  let totalCorrect = 0;
  let totalAttempts = 0;

  cardStates.forEach((state) => {
    if (getSyllableCount(state.sequenceKey) === prevSyllables) {
      totalCorrect += state.correct;
      totalAttempts += state.total;
    }
  });

  if (totalAttempts < MIN_ATTEMPTS_FOR_MASTERY) return false;
  const accuracy = totalCorrect / totalAttempts;
  return accuracy >= MASTERY_THRESHOLD;
}

function calculatePriorityScore(
  sequenceKey: string,
  card: Card | null,
  accuracy: number,
  now: Date,
  cardStates: Map<string, ToneCardState>
): number {
  const syllableCount = getSyllableCount(sequenceKey);

  if (!isSyllableLevelUnlocked(syllableCount, cardStates)) {
    return 0;
  }

  const frequencyWeight = getFrequencyWeight(sequenceKey);

  const syllablePenalty = syllableCount === 1 ? 1.0 :
                          syllableCount === 2 ? 0.5 :
                          syllableCount === 3 ? 0.25 : 0.1;

  let dueUrgency = 1;
  if (card) {
    const msOverdue = now.getTime() - card.due.getTime();
    if (msOverdue > 0) {
      const hoursOverdue = msOverdue / (1000 * 60 * 60);
      dueUrgency = 1 + Math.min(hoursOverdue / 24, 5);
    } else {
      dueUrgency = 0.05;
    }
  } else {
    dueUrgency = 1.0;
  }

  const proficiency = accuracy > 0 ? accuracy : 0.5;
  const proficiencyFactor = 1.5 - proficiency;

  return frequencyWeight * syllablePenalty * dueUrgency * proficiencyFactor;
}

/**
 * FSRS hook for tone sequence tracking with backend persistence.
 */
export function useToneFSRS(words: Word[]) {
  const [cardStates, setCardStates] = useState<Map<string, ToneCardState>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [isMounted, setIsMounted] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Track when component is mounted (client-side only)
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Load from backend on mount (client-side only)
  useEffect(() => {
    // Skip if not mounted yet (SSR)
    if (!isMounted) {
      return;
    }

    async function loadFromBackend() {
      try {
        const authenticated = await syncApi.isAuthenticated();
        setIsAuthenticated(authenticated);

        if (authenticated) {
          // Use authenticated sync endpoint
          const data = await syncApi.getSyncData();
          const map = new Map<string, ToneCardState>();
          for (const toneCard of data.tone_cards) {
            const state: ToneCardState = {
              sequenceKey: toneCard.sequence_key,
              card: {
                ...(toneCard.card as BackendCardState['card']),
                due: new Date((toneCard.card as BackendCardState['card']).due),
                last_review: (toneCard.card as BackendCardState['card']).last_review
                  ? new Date((toneCard.card as BackendCardState['card']).last_review!)
                  : undefined,
              } as Card,
              correct: toneCard.correct,
              total: toneCard.total,
            };
            map.set(state.sequenceKey, state);
          }
          setCardStates(map);
        } else {
          // Fall back to public endpoint
          const url = `${API_BASE_URL}/api/fsrs/tone-cards`;
          const response = await fetch(url);
          if (response.ok) {
            const data = await response.json();
            const map = new Map<string, ToneCardState>();
            for (const card of data.cards) {
              const state = fromBackend(card);
              map.set(state.sequenceKey, state);
            }
            setCardStates(map);
          }
        }
      } catch (e) {
        console.error('Failed to load tone cards from backend:', e);
      } finally {
        setIsLoading(false);
      }
    }
    loadFromBackend();
  }, [isMounted]);

  const saveCardToBackend = useCallback(async (state: ToneCardState) => {
    try {
      if (isAuthenticated) {
        // Use authenticated sync endpoint
        const cardJson = {
          ...state.card,
          due: state.card.due.toISOString(),
          last_review: state.card.last_review?.toISOString(),
        };
        await syncApi.updateToneCard(state.sequenceKey, cardJson, state.correct, state.total);
      } else {
        // Fall back to public endpoint
        await fetch(`${API_BASE_URL}/api/fsrs/tone-cards/${encodeURIComponent(state.sequenceKey)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(toBackend(state)),
        });
      }
    } catch (e) {
      console.error('Failed to save tone card to backend:', e);
    }
  }, [isAuthenticated]);

  const wordsBySequence = useMemo(() => {
    const map = new Map<string, Word[]>();
    for (const word of words) {
      const sequence = getToneSequence(word.vietnamese);
      const key = getToneSequenceKey(sequence);
      const existing = map.get(key) || [];
      existing.push(word);
      map.set(key, existing);
    }
    return map;
  }, [words]);

  const allSequenceKeys = useMemo(() => {
    return Array.from(wordsBySequence.keys());
  }, [wordsBySequence]);

  const getCardForSequence = useCallback((sequenceKey: string): ToneCardState => {
    const existing = cardStates.get(sequenceKey);
    if (existing) return existing;

    return {
      sequenceKey,
      card: createEmptyCard(),
      correct: 0,
      total: 0,
    };
  }, [cardStates]);

  const getNextWord = useCallback((): WordWithSequence | null => {
    if (isLoading) return null;

    const now = new Date();
    const scoredSequences: { key: string; score: number }[] = [];

    for (const key of allSequenceKeys) {
      const state = cardStates.get(key);
      const card = state?.card || null;

      if (card && card.due > now) {
        continue;
      }

      const accuracy = state && state.total > 0 ? state.correct / state.total : 0;
      const score = calculatePriorityScore(key, card, accuracy, now, cardStates);

      if (score > 0) {
        scoredSequences.push({ key, score });
      }
    }

    if (scoredSequences.length === 0) {
      return null;
    }

    scoredSequences.sort((a, b) => b.score - a.score);

    const topN = Math.min(3, scoredSequences.length);
    const totalScore = scoredSequences.slice(0, topN).reduce((sum, s) => sum + s.score, 0);
    let random = Math.random() * totalScore;

    let selectedKey = scoredSequences[0].key;
    for (let i = 0; i < topN; i++) {
      random -= scoredSequences[i].score;
      if (random <= 0) {
        selectedKey = scoredSequences[i].key;
        break;
      }
    }

    const wordsWithSequence = wordsBySequence.get(selectedKey);
    if (!wordsWithSequence || wordsWithSequence.length === 0) {
      return null;
    }

    const randomIndex = Math.floor(Math.random() * wordsWithSequence.length);
    return {
      word: wordsWithSequence[randomIndex],
      sequenceKey: selectedKey,
    };
  }, [allSequenceKeys, cardStates, wordsBySequence, isLoading]);

  const recordReview = useCallback((sequenceKey: string, correct: boolean): void => {
    const state = getCardForSequence(sequenceKey);
    const rating = correct ? Rating.Good : Rating.Again;
    const result = f.repeat(state.card, new Date());
    const newCard = result[rating].card;

    const updatedState: ToneCardState = {
      sequenceKey,
      card: newCard,
      correct: state.correct + (correct ? 1 : 0),
      total: state.total + 1,
    };

    setCardStates(prev => {
      const newMap = new Map(prev);
      newMap.set(sequenceKey, updatedState);
      return newMap;
    });

    saveCardToBackend(updatedState);
  }, [getCardForSequence, saveCardToBackend]);

  const getDueCount = useCallback((): number => {
    if (isLoading) return 0;

    const now = new Date();
    let count = 0;

    for (const key of allSequenceKeys) {
      const state = cardStates.get(key);
      if (!state || state.card.due <= now) {
        const syllables = getSyllableCount(key);
        if (isSyllableLevelUnlocked(syllables, cardStates)) {
          count++;
        }
      }
    }

    return count;
  }, [allSequenceKeys, cardStates, isLoading]);

  const getSequenceAccuracy = useCallback((sequenceKey: string): number | null => {
    const state = cardStates.get(sequenceKey);
    if (!state || state.total === 0) return null;
    return state.correct / state.total;
  }, [cardStates]);

  const getOverallAccuracy = useCallback((): number | null => {
    let totalCorrect = 0;
    let totalReviews = 0;

    cardStates.forEach((state) => {
      totalCorrect += state.correct;
      totalReviews += state.total;
    });

    if (totalReviews === 0) return null;
    return totalCorrect / totalReviews;
  }, [cardStates]);

  return {
    getNextWord,
    recordReview,
    getDueCount,
    getCardForSequence,
    getSequenceAccuracy,
    getOverallAccuracy,
    isLoading,
  };
}
