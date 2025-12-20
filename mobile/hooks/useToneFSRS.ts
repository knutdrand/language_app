import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { createEmptyCard, fsrs, Rating, type Card, type FSRSParameters } from 'ts-fsrs';
import type { Word } from '../types';
import { getToneSequence, getToneSequenceKey } from '../utils/tones';
import { getFrequencyWeight } from '../data/toneFrequencies';
import { API_BASE_URL } from '../config';
import * as syncApi from '../services/syncApi';
import * as mlApi from '../services/mlApi';
import type { ConfusionState } from '../services/mlApi';

/**
 * Difficulty levels for progressive training.
 */
export type DifficultyLevel = '2-choice' | '4-choice' | 'multi-syllable';

/**
 * Mastery thresholds for progressive unlocking.
 */
const PAIR_MASTERY_THRESHOLD = 0.80;  // 80% for each pair direction
const MIN_ATTEMPTS_PER_PAIR = 10;     // 10 attempts per direction (increased for reliability)
const MIN_TOTAL_2CHOICE_ATTEMPTS = 100;  // Minimum total attempts before advancing from 2-choice
const FOUR_CHOICE_MASTERY_THRESHOLD = 0.80;
const MIN_ATTEMPTS_PER_TONE_4CHOICE = 10;
const ALL_TONES = ['1', '2', '3', '4', '5', '6'];  // All 6 Vietnamese tones

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
  /** Selected alternatives (0-indexed tone numbers) - available for 2-choice and 4-choice */
  selectedAlternatives?: number[];
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

  // For multi-syllable: require ALL 6 tones to have >= 80% accuracy with 4-choice
  for (const tone of ALL_TONES) {
    const state = cardStates.get(tone);

    // Must have enough attempts for this tone
    if (!state || state.total < MIN_ATTEMPTS_PER_TONE_4CHOICE) {
      return false;
    }

    // Must have >= 80% accuracy for this tone
    const accuracy = state.correct / state.total;
    if (accuracy < FOUR_CHOICE_MASTERY_THRESHOLD) {
      return false;
    }
  }

  return true;
}

/**
 * Get pair accuracy from confusion matrix for a specific pair (a, b).
 * Returns the accuracy when tone 'a' is played and user has to choose between a and b.
 */
function getPairAccuracy(
  confusionState: ConfusionState | null,
  a: number,
  b: number
): { accuracy: number; attempts: number } {
  if (!confusionState) return { accuracy: 0, attempts: 0 };

  // For pair (a, b), we look at row 'a' in the confusion matrix
  // counts[a][a] = times a was correctly identified
  // counts[a][b] = times a was confused with b
  const correctCount = confusionState.counts[a]?.[a] ?? 0;
  const confusedCount = confusionState.counts[a]?.[b] ?? 0;
  const attempts = correctCount + confusedCount;

  if (attempts === 0) return { accuracy: 0, attempts: 0 };
  return { accuracy: correctCount / attempts, attempts };
}

/**
 * Get total attempts from confusion matrix (sum of all cells).
 */
function getTotalAttempts(confusionState: ConfusionState | null): number {
  if (!confusionState) return 0;
  let total = 0;
  for (const row of confusionState.counts) {
    for (const count of row) {
      total += count;
    }
  }
  return total;
}

/**
 * Check if all 15 tone pairs are mastered.
 * A pair is mastered when P(correct | alternatives={a,b}) > 80%.
 * Requires minimum total attempts to prevent premature advancement.
 */
function areAllPairsMastered(confusionState: ConfusionState | null): boolean {
  if (!confusionState) return false;

  // Require minimum total attempts before considering advancement
  const totalAttempts = getTotalAttempts(confusionState);
  if (totalAttempts < MIN_TOTAL_2CHOICE_ATTEMPTS) {
    return false;
  }

  // Check all 15 pairs (combinations of 6 tones, 0-indexed)
  const allPairs = getAllPairs();
  for (const [a, b] of allPairs) {
    const correctProb = getPairCorrectProbability(confusionState, a, b);
    if (correctProb < PAIR_MASTERY_THRESHOLD) {
      return false;
    }
  }
  return true;
}

/**
 * Check if all 15 four-choice sets are mastered.
 * A set is mastered when P(correct | alternatives=set) > 80%.
 */
function areAllFourChoiceSetsMastered(confusionState: ConfusionState | null): boolean {
  if (!confusionState) return false;

  const allSets = getAllFourChoiceSets();
  for (const set of allSets) {
    const correctProb = getFourChoiceCorrectProbability(confusionState, set);
    if (correctProb < FOUR_CHOICE_MASTERY_THRESHOLD) {
      return false;
    }
  }
  return true;
}

/**
 * Get the weakest pair that needs more practice.
 * Returns [toneA, toneB] where toneA/B are 1-indexed.
 */
function getWeakestPair(confusionState: ConfusionState | null): [number, number] {
  if (!confusionState) return [1, 2];  // Default pair

  let weakest: [number, number] = [1, 2];
  let lowestScore = Infinity;

  for (let a = 0; a < 6; a++) {
    for (let b = a + 1; b < 6; b++) {
      // Calculate combined score for this pair (lower = needs more practice)
      const { accuracy: accAB, attempts: attAB } = getPairAccuracy(confusionState, a, b);
      const { accuracy: accBA, attempts: attBA } = getPairAccuracy(confusionState, b, a);

      // Score is weighted by both accuracy and attempt count
      // Pairs with fewer attempts get lower scores (need more practice)
      const attemptWeight = Math.min(attAB, attBA, MIN_ATTEMPTS_PER_PAIR) / MIN_ATTEMPTS_PER_PAIR;
      const avgAccuracy = (accAB + accBA) / 2;
      const score = attemptWeight * avgAccuracy;

      if (score < lowestScore) {
        lowestScore = score;
        weakest = [a + 1, b + 1];  // Convert to 1-indexed
      }
    }
  }

  return weakest;
}

/**
 * Calculate P(error) for a 2-choice drill with given alternatives.
 * P(error | alternatives={a,b}) = 0.5 * P(error | a played) + 0.5 * P(error | b played)
 * where P(error | a played) = P(user chooses b | a played)
 *
 * @param confusionState The confusion matrix
 * @param a First tone (0-indexed)
 * @param b Second tone (0-indexed)
 * @returns Error probability in [0, 1], defaults to 0.5 for untested pairs
 */
function getPairErrorProbability(
  confusionState: ConfusionState | null,
  a: number,
  b: number
): number {
  if (!confusionState) return 0.5;  // No data, assume 50% error

  // P(error | a played, alternatives={a,b}) = counts[a][b] / (counts[a][a] + counts[a][b])
  const countsAA = confusionState.counts[a]?.[a] ?? 0;
  const countsAB = confusionState.counts[a]?.[b] ?? 0;
  const totalA = countsAA + countsAB;
  const errorGivenA = totalA > 0 ? countsAB / totalA : 0.5;

  // P(error | b played, alternatives={a,b}) = counts[b][a] / (counts[b][b] + counts[b][a])
  const countsBB = confusionState.counts[b]?.[b] ?? 0;
  const countsBA = confusionState.counts[b]?.[a] ?? 0;
  const totalB = countsBB + countsBA;
  const errorGivenB = totalB > 0 ? countsBA / totalB : 0.5;

  // Average over both tones (50% chance each is played)
  return 0.5 * errorGivenA + 0.5 * errorGivenB;
}

/**
 * Calculate P(correct) for a 2-choice drill with given alternatives.
 * @returns Correct probability in [0, 1]
 */
function getPairCorrectProbability(
  confusionState: ConfusionState | null,
  a: number,
  b: number
): number {
  return 1 - getPairErrorProbability(confusionState, a, b);
}

/**
 * Generate all 15 possible pairs of tones (0-indexed).
 */
function getAllPairs(): [number, number][] {
  const pairs: [number, number][] = [];
  for (let a = 0; a < 6; a++) {
    for (let b = a + 1; b < 6; b++) {
      pairs.push([a, b]);
    }
  }
  return pairs;
}

/**
 * Calculate P(error) for a 4-choice drill with given alternatives.
 * P(error | alternatives=set) = (1/4) * sum over t in set of P(error | t played)
 * where P(error | t played) = 1 - P(t chosen | t played)
 *
 * @param confusionState The confusion matrix
 * @param alternatives Array of 4 tone indices (0-indexed)
 * @returns Error probability in [0, 1]
 */
function getFourChoiceErrorProbability(
  confusionState: ConfusionState | null,
  alternatives: number[]
): number {
  if (!confusionState || alternatives.length !== 4) return 0.75;  // Default 75% error (random guessing)

  let totalError = 0;
  for (const tone of alternatives) {
    // P(error | tone played) = 1 - P(tone chosen | tone played, alternatives)
    // = 1 - counts[tone][tone] / sum(counts[tone][alt] for alt in alternatives)
    let sumCounts = 0;
    for (const alt of alternatives) {
      sumCounts += confusionState.counts[tone]?.[alt] ?? 0;
    }

    const correctCount = confusionState.counts[tone]?.[tone] ?? 0;
    const correctProb = sumCounts > 0 ? correctCount / sumCounts : 0.25;  // Default to random guess
    totalError += (1 - correctProb);
  }

  return totalError / 4;  // Average over all 4 tones
}

/**
 * Calculate P(correct) for a 4-choice drill with given alternatives.
 */
function getFourChoiceCorrectProbability(
  confusionState: ConfusionState | null,
  alternatives: number[]
): number {
  return 1 - getFourChoiceErrorProbability(confusionState, alternatives);
}

/**
 * Generate all 15 possible sets of 4 tones (0-indexed).
 * C(6,4) = 15
 */
function getAllFourChoiceSets(): number[][] {
  const sets: number[][] = [];
  for (let exclude1 = 0; exclude1 < 6; exclude1++) {
    for (let exclude2 = exclude1 + 1; exclude2 < 6; exclude2++) {
      const set = [0, 1, 2, 3, 4, 5].filter(t => t !== exclude1 && t !== exclude2);
      sets.push(set);
    }
  }
  return sets;
}

/**
 * Sample from weighted options. Returns the selected index.
 * @param weights Array of weights (higher = more likely)
 */
function weightedSample(weights: number[]): number {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total === 0) return Math.floor(Math.random() * weights.length);

  let random = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    random -= weights[i];
    if (random <= 0) return i;
  }
  return weights.length - 1;
}

/**
 * Get the current difficulty level based on confusion state and card states.
 */
function getCurrentDifficultyLevel(
  confusionState: ConfusionState | null,
  _cardStates: Map<string, ToneCardState>
): DifficultyLevel {
  // Level 1: 2-choice until all pairs mastered (>80% P(correct) for each pair)
  if (!areAllPairsMastered(confusionState)) {
    return '2-choice';
  }

  // Level 2: 4-choice until all 4-choice sets mastered (>80% P(correct) for each set)
  if (!areAllFourChoiceSetsMastered(confusionState)) {
    return '4-choice';
  }

  // Level 3: multi-syllable
  return 'multi-syllable';
}

/**
 * Calculate confusion-based difficulty factor from confusion state.
 * Returns a value >= 1.0, where higher means more confused.
 */
function getConfusionFactor(
  sequenceKey: string,
  confusionState: ConfusionState | null
): number {
  if (!confusionState) return 1.0;

  // Parse sequence key to get individual tones
  const toneNumbers = sequenceKey.split('-').map(Number);

  // Calculate average confusion for all tones in the sequence
  let totalConfusion = 0;
  for (const toneNum of toneNumbers) {
    const toneIdx = toneNum - 1;
    if (toneIdx >= 0 && toneIdx < confusionState.counts.length) {
      const row = confusionState.counts[toneIdx];
      const sum = row.reduce((a, b) => a + b, 0);
      const correctProb = row[toneIdx] / sum;
      // Confusion = 1 - P(correct), scaled to [1.0, 2.0]
      totalConfusion += 1 + (1 - correctProb);
    } else {
      totalConfusion += 1.0;
    }
  }

  return totalConfusion / toneNumbers.length;
}

function calculatePriorityScore(
  sequenceKey: string,
  card: Card | null,
  accuracy: number,
  now: Date,
  cardStates: Map<string, ToneCardState>,
  confusionState: ConfusionState | null
): number {
  const syllableCount = getSyllableCount(sequenceKey);

  if (!isSyllableLevelUnlocked(syllableCount, cardStates)) {
    return 0;
  }

  const frequencyWeight = getFrequencyWeight(sequenceKey);

  const syllablePenalty = syllableCount === 1 ? 1.0 :
                          syllableCount === 2 ? 0.5 :
                          syllableCount === 3 ? 0.25 : 0.1;

  // ML-based priority: use confusion model to determine difficulty
  // Higher confusion (lower accuracy) = higher priority
  const confusionFactor = getConfusionFactor(sequenceKey, confusionState);

  // Error probability from confusion model (1.0 = always wrong, 0.0 = always right)
  // confusionFactor is in range [1.0, 2.0], so errorProb is [0.0, 1.0]
  const errorProb = confusionFactor - 1.0;

  // Priority is driven by confusion: higher error probability = higher priority
  // Base priority 0.5 + error probability boost up to 1.0
  const confusionPriority = 0.5 + errorProb;

  return frequencyWeight * syllablePenalty * confusionPriority;
}

/**
 * FSRS hook for tone sequence tracking with backend persistence.
 */
export function useToneFSRS(words: Word[]) {
  const [cardStates, setCardStates] = useState<Map<string, ToneCardState>>(new Map());
  const [confusionState, setConfusionState] = useState<ConfusionState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMounted, setIsMounted] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const confusionStateRef = useRef<ConfusionState | null>(null);

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

          // Load confusion state from sync API if available
          if (data.confusion_state) {
            setConfusionState(data.confusion_state);
            confusionStateRef.current = data.confusion_state;
            // Also save to local storage as cache
            await mlApi.saveConfusionState(data.confusion_state);
          }
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
        // Load confusion state from AsyncStorage or initialize from backend
        let loadedConfusionState = await mlApi.loadConfusionState();
        if (!loadedConfusionState) {
          loadedConfusionState = await mlApi.getInitialState();
          await mlApi.saveConfusionState(loadedConfusionState);
        }
        setConfusionState(loadedConfusionState);
        confusionStateRef.current = loadedConfusionState;
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

  // Helper to get any mono-syllabic word (fallback)
  const getAnyMonoSyllabicWord = useCallback((): WordWithSequence | null => {
    // Try all 6 tones in random order
    const shuffledTones = [1, 2, 3, 4, 5, 6].sort(() => Math.random() - 0.5);
    for (const tone of shuffledTones) {
      const key = String(tone);
      const words = wordsBySequence.get(key);
      if (words && words.length > 0) {
        const randomIndex = Math.floor(Math.random() * words.length);
        // Default to a 2-choice with an adjacent tone
        const otherTone = tone < 6 ? tone : tone - 1;
        return {
          word: words[randomIndex],
          sequenceKey: key,
          selectedAlternatives: [tone - 1, otherTone - 1],  // 0-indexed
        };
      }
    }
    return null;
  }, [wordsBySequence]);

  // Helper to get any word at all (last resort fallback)
  const getAnyWord = useCallback((): WordWithSequence | null => {
    for (const [key, wordList] of wordsBySequence.entries()) {
      if (wordList && wordList.length > 0) {
        const randomIndex = Math.floor(Math.random() * wordList.length);
        return {
          word: wordList[randomIndex],
          sequenceKey: key,
        };
      }
    }
    return null;
  }, [wordsBySequence]);

  const getNextWord = useCallback((): WordWithSequence | null => {
    if (isLoading) return null;

    const difficultyLevel = getCurrentDifficultyLevel(confusionState, cardStates);

    // TWO-STEP SAMPLING for 2-choice mode:
    // Step 1: Sample pair proportional to error probability
    // Step 2: Sample tone uniformly from the pair
    if (difficultyLevel === '2-choice') {
      const allPairs = getAllPairs();
      const errorProbs = allPairs.map(([a, b]) => getPairErrorProbability(confusionState, a, b));

      // Sample pair by error probability (higher error = more likely to be selected)
      const selectedPairIdx = weightedSample(errorProbs);
      const selectedPair = allPairs[selectedPairIdx];

      // Sample tone uniformly from the pair (50/50)
      const selectedToneIdx = Math.random() < 0.5 ? 0 : 1;
      let selectedTone = selectedPair[selectedToneIdx] + 1;  // Convert to 1-indexed
      let selectedKey = String(selectedTone);

      let wordsWithSequence = wordsBySequence.get(selectedKey);

      // If no words for this tone, try the other tone in the pair
      if (!wordsWithSequence || wordsWithSequence.length === 0) {
        const otherTone = selectedPair[1 - selectedToneIdx] + 1;
        const otherKey = String(otherTone);
        wordsWithSequence = wordsBySequence.get(otherKey);
        if (wordsWithSequence && wordsWithSequence.length > 0) {
          selectedKey = otherKey;
        }
      }

      // If still no words, try any mono-syllabic word
      if (!wordsWithSequence || wordsWithSequence.length === 0) {
        return getAnyMonoSyllabicWord() || getAnyWord();
      }

      const randomIndex = Math.floor(Math.random() * wordsWithSequence.length);
      return {
        word: wordsWithSequence[randomIndex],
        sequenceKey: selectedKey,
        selectedAlternatives: selectedPair,  // 0-indexed
      };
    }

    // TWO-STEP SAMPLING for 4-choice mode:
    // Step 1: Sample set of 4 alternatives proportional to error probability
    // Step 2: Sample tone uniformly from the set
    if (difficultyLevel === '4-choice') {
      const allSets = getAllFourChoiceSets();
      const errorProbs = allSets.map(set => getFourChoiceErrorProbability(confusionState, set));

      // Sample set by error probability (higher error = more likely to be selected)
      const selectedSetIdx = weightedSample(errorProbs);
      const selectedSet = allSets[selectedSetIdx];

      // Shuffle the set to try tones in random order
      const shuffledIndices = [0, 1, 2, 3].sort(() => Math.random() - 0.5);

      let selectedKey: string | undefined;
      let wordsWithSequence: Word[] | undefined;

      // Try each tone in the set until we find one with mono-syllabic words
      for (const idx of shuffledIndices) {
        const tone = selectedSet[idx] + 1;  // Convert to 1-indexed
        const key = String(tone);
        const words = wordsBySequence.get(key);
        if (words && words.length > 0) {
          selectedKey = key;
          wordsWithSequence = words;
          break;
        }
      }

      // If still no words, try any mono-syllabic word
      if (!selectedKey || !wordsWithSequence || wordsWithSequence.length === 0) {
        return getAnyMonoSyllabicWord() || getAnyWord();
      }

      const randomIndex = Math.floor(Math.random() * wordsWithSequence.length);
      return {
        word: wordsWithSequence[randomIndex],
        sequenceKey: selectedKey,
        selectedAlternatives: selectedSet,  // 0-indexed
      };
    }

    // For multi-syllable: use priority-based selection (no alternative sampling needed)
    const now = new Date();
    const scoredSequences: { key: string; score: number }[] = [];

    for (const key of allSequenceKeys) {
      const syllableCount = getSyllableCount(key);

      // Multi-syllable mode: include multi-syllable words
      if (syllableCount < 2) {
        continue;  // Skip single-syllable in multi-syllable mode
      }

      const state = cardStates.get(key);
      const card = state?.card || null;

      const accuracy = state && state.total > 0 ? state.correct / state.total : 0;
      const score = calculatePriorityScore(key, card, accuracy, now, cardStates, confusionState);

      if (score > 0) {
        scoredSequences.push({ key, score });
      }
    }

    // If no multi-syllable words with score, fall back to any word
    if (scoredSequences.length === 0) {
      return getAnyWord();
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
      return getAnyWord();
    }

    const randomIndex = Math.floor(Math.random() * wordsWithSequence.length);
    return {
      word: wordsWithSequence[randomIndex],
      sequenceKey: selectedKey,
    };
  }, [allSequenceKeys, cardStates, wordsBySequence, isLoading, confusionState, getAnyMonoSyllabicWord, getAnyWord]);

  const recordReview = useCallback((sequenceKey: string, correct: boolean, chosenSequenceKey?: string): void => {
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

    // Update local state
    setCardStates(prev => {
      const newMap = new Map(prev);
      newMap.set(sequenceKey, updatedState);
      return newMap;
    });

    // Save to backend
    saveCardToBackend(updatedState);

    // Update confusion state for each tone in the sequence
    if (confusionStateRef.current) {
      const correctTones = sequenceKey.split('-').map(Number);
      const chosenTones = (chosenSequenceKey || sequenceKey).split('-').map(Number);
      const newCounts = confusionStateRef.current.counts.map((row) => [...row]);

      // Update confusion matrix: for each position, record what was chosen vs what was correct
      const minLen = Math.min(correctTones.length, chosenTones.length);
      for (let i = 0; i < minLen; i++) {
        const correctIdx = correctTones[i] - 1;
        const chosenIdx = chosenTones[i] - 1;
        if (correctIdx >= 0 && correctIdx < 6 && chosenIdx >= 0 && chosenIdx < 6) {
          newCounts[correctIdx][chosenIdx] += 1;
        }
      }

      const newConfusionState = { counts: newCounts };
      confusionStateRef.current = newConfusionState;
      setConfusionState(newConfusionState);
      mlApi.saveConfusionState(newConfusionState);

      // Sync to backend if authenticated
      if (isAuthenticated) {
        syncApi.updateConfusionState(newConfusionState).catch((e) => {
          console.error('Failed to sync confusion state to backend:', e);
        });
      }
    }
  }, [getCardForSequence, saveCardToBackend, isAuthenticated]);

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

  const getDifficultyLevel = useCallback((): DifficultyLevel => {
    return getCurrentDifficultyLevel(confusionState, cardStates);
  }, [confusionState, cardStates]);

  const getTargetPair = useCallback((): [number, number] => {
    return getWeakestPair(confusionState);
  }, [confusionState]);

  return {
    getNextWord,
    recordReview,
    getDueCount,
    getCardForSequence,
    getSequenceAccuracy,
    getOverallAccuracy,
    getDifficultyLevel,
    getTargetPair,
    isLoading,
  };
}
