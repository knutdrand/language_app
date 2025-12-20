import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { createEmptyCard, fsrs, Rating, type Card, type FSRSParameters } from 'ts-fsrs';
import type { Word } from '../types';
import { getToneSequence, getToneSequenceKey } from '../utils/tones';
import { getFrequencyWeight } from '../data/toneFrequencies';
import { API_BASE_URL } from '../config';
import * as mlApi from '../services/mlApi';
import * as syncApi from '../services/syncApi';
import type { ConfusionState } from '../services/mlApi';

/**
 * Mastery thresholds for progressive unlocking.
 *
 * Users must achieve these thresholds before unlocking longer sequences:
 * - 1-syllable: Always available
 * - 2+ syllable: Unlocks when ALL 6 tones have >= 80% accuracy with >= 5 attempts each
 */
const MASTERY_THRESHOLD = 0.80;  // 80% accuracy required per tone
const MIN_ATTEMPTS_PER_TONE = 5;  // Need at least 5 attempts per tone
const ALL_TONES = ['1', '2', '3', '4', '5', '6'];  // All 6 Vietnamese tones

// Progressive difficulty constants
export type DifficultyLevel = '2-choice' | '4-choice' | 'multi-syllable';
const PAIR_MASTERY_THRESHOLD = 0.80;
const FOUR_CHOICE_MASTERY_THRESHOLD = 0.80;
const MIN_ATTEMPTS_PER_PAIR = 10;      // 10 attempts per direction (increased for reliability)
const MIN_TOTAL_2CHOICE_ATTEMPTS = 100; // Minimum total attempts before advancing from 2-choice

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

// Convert backend format to frontend format
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

// Convert frontend format to backend format
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

/**
 * Get syllable count from sequence key (e.g., "1-2-3" has 3 syllables)
 */
function getSyllableCount(sequenceKey: string): number {
  return sequenceKey.split('-').length;
}

/**
 * Check if a syllable level is unlocked based on mastery of previous level.
 */
function isSyllableLevelUnlocked(
  targetSyllables: number,
  cardStates: Map<string, ToneCardState>
): boolean {
  if (targetSyllables <= 1) return true;

  // For multi-syllable: require ALL 6 tones to have >= 80% accuracy
  // This checks mono-syllable performance before unlocking 2+ syllables
  for (const tone of ALL_TONES) {
    const state = cardStates.get(tone);

    // Must have enough attempts for this tone
    if (!state || state.total < MIN_ATTEMPTS_PER_TONE) {
      return false;
    }

    // Must have >= 80% accuracy for this tone
    const accuracy = state.correct / state.total;
    if (accuracy < MASTERY_THRESHOLD) {
      return false;
    }
  }

  return true;
}

/**
 * Get accuracy for a specific tone pair from confusion matrix.
 */
function getPairAccuracy(
  confusionState: ConfusionState | null,
  a: number,
  b: number
): { accuracy: number; attempts: number } {
  if (!confusionState) return { accuracy: 0, attempts: 0 };

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
 * Check if all 15 tone pairs are mastered (>80% correct probability).
 * Requires minimum total attempts to prevent premature advancement.
 */
function areAllPairsMastered(confusionState: ConfusionState | null): boolean {
  if (!confusionState) return false;

  // Require minimum total attempts before considering advancement
  const totalAttempts = getTotalAttempts(confusionState);
  if (totalAttempts < MIN_TOTAL_2CHOICE_ATTEMPTS) {
    return false;
  }

  // Check all 15 pairs using probability-based mastery
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
 * Find the weakest tone pair for targeted practice.
 */
function getWeakestPair(confusionState: ConfusionState | null): [number, number] {
  if (!confusionState) return [1, 2];

  let weakest: [number, number] = [1, 2];
  let lowestScore = Infinity;

  for (let a = 0; a < 6; a++) {
    for (let b = a + 1; b < 6; b++) {
      const { accuracy: accAB, attempts: attAB } = getPairAccuracy(confusionState, a, b);
      const { accuracy: accBA, attempts: attBA } = getPairAccuracy(confusionState, b, a);

      // Score combines accuracy and attempt count (prioritize untested pairs)
      const attemptWeight = Math.min(attAB, attBA, MIN_ATTEMPTS_PER_PAIR) / MIN_ATTEMPTS_PER_PAIR;
      const avgAccuracy = (accAB + accBA) / 2;
      const score = attemptWeight * avgAccuracy;

      if (score < lowestScore) {
        lowestScore = score;
        weakest = [a + 1, b + 1];
      }
    }
  }
  return weakest;
}

/**
 * Calculate P(error) for a 2-choice drill with given alternatives.
 * P(error | alternatives={a,b}) = 0.5 * P(error | a played) + 0.5 * P(error | b played)
 */
function getPairErrorProbability(confusionState: ConfusionState | null, a: number, b: number): number {
  if (!confusionState) return 0.5;

  // P(error | a played, choices={a,b}) = P(choose b | a played)
  const countsAA = confusionState.counts[a]?.[a] ?? 0;
  const countsAB = confusionState.counts[a]?.[b] ?? 0;
  const totalA = countsAA + countsAB;
  const errorGivenA = totalA > 0 ? countsAB / totalA : 0.5;

  // P(error | b played, choices={a,b}) = P(choose a | b played)
  const countsBB = confusionState.counts[b]?.[b] ?? 0;
  const countsBA = confusionState.counts[b]?.[a] ?? 0;
  const totalB = countsBB + countsBA;
  const errorGivenB = totalB > 0 ? countsBA / totalB : 0.5;

  return 0.5 * errorGivenA + 0.5 * errorGivenB;
}

/**
 * Calculate P(correct) for a 2-choice drill with given alternatives.
 */
function getPairCorrectProbability(confusionState: ConfusionState | null, a: number, b: number): number {
  return 1 - getPairErrorProbability(confusionState, a, b);
}

/**
 * Get all 15 possible pairs of tones (C(6,2) = 15).
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
 * P(error | alternatives) = (1/4) * sum over t in alternatives of P(error | t played)
 */
function getFourChoiceErrorProbability(confusionState: ConfusionState | null, alternatives: number[]): number {
  if (!confusionState || alternatives.length !== 4) return 0.75;

  let totalError = 0;
  for (const tone of alternatives) {
    // P(error | tone played) = 1 - P(correct | tone played)
    // P(correct | tone played) = counts[tone][tone] / sum over alt in alternatives of counts[tone][alt]
    let sumCounts = 0;
    for (const alt of alternatives) {
      sumCounts += confusionState.counts[tone]?.[alt] ?? 0;
    }
    const correctCount = confusionState.counts[tone]?.[tone] ?? 0;
    const correctProb = sumCounts > 0 ? correctCount / sumCounts : 0.25;
    totalError += (1 - correctProb);
  }
  return totalError / 4;
}

/**
 * Calculate P(correct) for a 4-choice drill with given alternatives.
 */
function getFourChoiceCorrectProbability(confusionState: ConfusionState | null, alternatives: number[]): number {
  return 1 - getFourChoiceErrorProbability(confusionState, alternatives);
}

/**
 * Get all 15 possible 4-choice sets (C(6,4) = 15, equivalently C(6,2) = 15 ways to exclude 2).
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
 * Sample an index from an array of weights proportional to their values.
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
 * Check if all 15 four-choice sets are mastered (>80% correct probability).
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
 * Determine current difficulty level based on mastery.
 */
function getCurrentDifficultyLevel(
  confusionState: ConfusionState | null,
  _cardStates: Map<string, ToneCardState>
): DifficultyLevel {
  if (!areAllPairsMastered(confusionState)) {
    return '2-choice';
  }

  if (!areAllFourChoiceSetsMastered(confusionState)) {
    return '4-choice';
  }

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

/**
 * Calculate priority score for a tone sequence.
 */
function calculatePriorityScore(
  sequenceKey: string,
  _card: Card | null,
  _accuracy: number,
  _now: Date,
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
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const confusionStateRef = useRef<ConfusionState | null>(null);

  // Load from backend on mount
  useEffect(() => {
    async function loadFromBackend() {
      try {
        const authenticated = syncApi.isAuthenticated();
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
            mlApi.saveConfusionState(data.confusion_state);
          }
        } else {
          // Fall back to public endpoint
          const response = await fetch(`${API_BASE_URL}/api/fsrs/tone-cards`);
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

        // Load confusion state from localStorage or initialize from backend (fallback)
        if (!confusionStateRef.current) {
          let loadedConfusionState = mlApi.loadConfusionState();
          if (!loadedConfusionState) {
            loadedConfusionState = await mlApi.getInitialState();
            mlApi.saveConfusionState(loadedConfusionState);
          }
          setConfusionState(loadedConfusionState);
          confusionStateRef.current = loadedConfusionState;
        }
      } catch (e) {
        console.error('Failed to load tone cards from backend:', e);
      } finally {
        setIsLoading(false);
      }
    }
    loadFromBackend();
  }, []);

  // Save single card to backend
  const saveCardToBackend = useCallback(async (state: ToneCardState) => {
    try {
      await fetch(`${API_BASE_URL}/api/fsrs/tone-cards/${encodeURIComponent(state.sequenceKey)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toBackend(state)),
      });
    } catch (e) {
      console.error('Failed to save tone card to backend:', e);
    }
  }, []);

  // Group words by their tone sequence
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
        const otherTone = tone < 6 ? tone + 1 : tone - 1;
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

    const now = new Date();
    const difficultyLevel = getCurrentDifficultyLevel(confusionState, cardStates);

    // Two-step sampling for 2-choice mode:
    // Step 1: Sample pair by error probability (higher error = more likely)
    // Step 2: Sample tone uniformly from the selected pair, find a word containing that tone
    if (difficultyLevel === '2-choice') {
      const allPairs = getAllPairs();
      const errorProbs = allPairs.map(([a, b]) => getPairErrorProbability(confusionState, a, b));
      const selectedPairIdx = weightedSample(errorProbs);
      const selectedPair = allPairs[selectedPairIdx];

      // Sample tone uniformly from the pair
      const selectedToneIdx = Math.random() < 0.5 ? 0 : 1;
      const selectedTone = selectedPair[selectedToneIdx];

      // Find all sequence keys that start with this tone (mono-syllabic)
      const matchingKeys = allSequenceKeys.filter(key => {
        const tones = key.split('-').map(Number);
        return tones.length === 1 && tones[0] === selectedTone + 1;
      });

      // If no mono-syllabic words with this tone, try the other tone in the pair
      let selectedKey: string;
      let wordsWithSequence: Word[] | undefined;

      if (matchingKeys.length > 0) {
        selectedKey = matchingKeys[Math.floor(Math.random() * matchingKeys.length)];
        wordsWithSequence = wordsBySequence.get(selectedKey);
      }

      if (!wordsWithSequence || wordsWithSequence.length === 0) {
        // Try the other tone
        const otherTone = selectedPair[1 - selectedToneIdx];
        const otherMatchingKeys = allSequenceKeys.filter(key => {
          const tones = key.split('-').map(Number);
          return tones.length === 1 && tones[0] === otherTone + 1;
        });

        if (otherMatchingKeys.length > 0) {
          selectedKey = otherMatchingKeys[Math.floor(Math.random() * otherMatchingKeys.length)];
          wordsWithSequence = wordsBySequence.get(selectedKey);
        }
      }

      if (!wordsWithSequence || wordsWithSequence.length === 0) {
        // No mono-syllabic words available for this pair, use fallback
        return getAnyMonoSyllabicWord() || getAnyWord();
      }

      const randomIndex = Math.floor(Math.random() * wordsWithSequence.length);
      return {
        word: wordsWithSequence[randomIndex],
        sequenceKey: selectedKey!,
        selectedAlternatives: selectedPair,
      };
    }

    // Two-step sampling for 4-choice mode:
    // Step 1: Sample 4-choice set by error probability (higher error = more likely)
    // Step 2: Sample tone uniformly from the selected set, find a word containing that tone
    if (difficultyLevel === '4-choice') {
      const allSets = getAllFourChoiceSets();
      const errorProbs = allSets.map(set => getFourChoiceErrorProbability(confusionState, set));
      const selectedSetIdx = weightedSample(errorProbs);
      const selectedSet = allSets[selectedSetIdx];

      // Shuffle the set to try tones in random order
      const shuffledIndices = [0, 1, 2, 3].sort(() => Math.random() - 0.5);

      let selectedKey: string | undefined;
      let wordsWithSequence: Word[] | undefined;

      // Try each tone in the set until we find one with mono-syllabic words
      for (const idx of shuffledIndices) {
        const tone = selectedSet[idx];
        const matchingKeys = allSequenceKeys.filter(key => {
          const tones = key.split('-').map(Number);
          return tones.length === 1 && tones[0] === tone + 1;
        });

        if (matchingKeys.length > 0) {
          selectedKey = matchingKeys[Math.floor(Math.random() * matchingKeys.length)];
          wordsWithSequence = wordsBySequence.get(selectedKey);
          if (wordsWithSequence && wordsWithSequence.length > 0) {
            break;
          }
        }
      }

      if (!wordsWithSequence || wordsWithSequence.length === 0) {
        // No mono-syllabic words available for this set, use fallback
        return getAnyMonoSyllabicWord() || getAnyWord();
      }

      const randomIndex = Math.floor(Math.random() * wordsWithSequence.length);
      return {
        word: wordsWithSequence[randomIndex],
        sequenceKey: selectedKey!,
        selectedAlternatives: selectedSet,
      };
    }

    // Multi-syllable mode: use existing priority-based selection
    const scoredSequences: { key: string; score: number }[] = [];

    for (const key of allSequenceKeys) {
      // In multi-syllable mode, use all words
      const state = cardStates.get(key);
      const card = state?.card || null;

      // Don't skip non-due cards - always have drills available
      // FSRS priority scoring will weight due cards higher via dueUrgency

      const accuracy = state && state.total > 0 ? state.correct / state.total : 0;
      const score = calculatePriorityScore(key, card, accuracy, now, cardStates, confusionState);

      if (score > 0) {
        scoredSequences.push({ key, score });
      }
    }

    if (scoredSequences.length === 0) {
      // No scored sequences, use fallback
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
      // Selected key has no words, use fallback
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
        // Check if syllable level is unlocked
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

  /**
   * Get success probability for a specific undirected tone pair.
   * Returns a value between 0 and 1.
   */
  const getPairSuccessProbability = useCallback((a: number, b: number): number => {
    return getPairCorrectProbability(confusionState, a, b);
  }, [confusionState]);

  /**
   * Get success probabilities for all 15 undirected tone pairs.
   * Returns an array of { pair: [a, b], probability: number, attempts: number }
   */
  const getAllPairProbabilities = useCallback((): Array<{ pair: [number, number]; probability: number; attempts: number }> => {
    const pairs = getAllPairs();
    return pairs.map(([a, b]) => {
      // Get attempts for both directions
      const { attempts: attAB } = getPairAccuracy(confusionState, a, b);
      const { attempts: attBA } = getPairAccuracy(confusionState, b, a);
      return {
        pair: [a, b] as [number, number],
        probability: getPairCorrectProbability(confusionState, a, b),
        attempts: attAB + attBA,
      };
    });
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
    getPairSuccessProbability,
    getAllPairProbabilities,
    isLoading,
  };
}
