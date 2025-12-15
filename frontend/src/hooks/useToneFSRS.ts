import { useCallback, useMemo } from 'react';
import { createEmptyCard, fsrs, Rating, type Card } from 'ts-fsrs';
import type { Word } from '../types';
import { getToneSequence, getToneSequenceKey } from '../utils/tones';

const STORAGE_KEY = 'language_app_cards_tone_sequences';

interface ToneCardState {
  sequenceKey: string;
  card: Card;
}

const f = fsrs();

function loadCardStates(): Map<string, Card> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as ToneCardState[];
      const map = new Map<string, Card>();
      for (const state of parsed) {
        const card: Card = {
          ...state.card,
          due: new Date(state.card.due),
          last_review: state.card.last_review ? new Date(state.card.last_review) : undefined,
        };
        map.set(state.sequenceKey, card);
      }
      return map;
    }
  } catch (e) {
    console.error('Failed to load tone card states:', e);
  }
  return new Map();
}

function saveCardStates(cards: Map<string, Card>): void {
  const states: ToneCardState[] = [];
  cards.forEach((card, sequenceKey) => {
    states.push({ sequenceKey, card });
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(states));
}

interface WordWithSequence {
  word: Word;
  sequenceKey: string;
}

/**
 * FSRS hook for tone sequence tracking.
 * Tracks mastery of tone sequences (e.g., "3-2" for Rising→Falling)
 * rather than individual words.
 */
export function useToneFSRS(words: Word[]) {
  const cardStates = useMemo(() => loadCardStates(), []);

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

  // Get all unique sequence keys
  const allSequenceKeys = useMemo(() => {
    return Array.from(wordsBySequence.keys());
  }, [wordsBySequence]);

  const getCardForSequence = useCallback((sequenceKey: string): Card => {
    const existing = cardStates.get(sequenceKey);
    if (existing) return existing;

    const newCard = createEmptyCard();
    cardStates.set(sequenceKey, newCard);
    return newCard;
  }, [cardStates]);

  /**
   * Get next word to review based on due tone sequences.
   * Returns a random word from the most due sequence.
   */
  const getNextWord = useCallback((): WordWithSequence | null => {
    const now = new Date();

    // Find sequences that are due or new
    const dueSequences: { key: string; card: Card }[] = [];
    const newSequences: string[] = [];

    for (const key of allSequenceKeys) {
      const card = cardStates.get(key);
      if (!card) {
        newSequences.push(key);
      } else if (card.due <= now) {
        dueSequences.push({ key, card });
      }
    }

    let selectedKey: string | null = null;

    // Prioritize due sequences (oldest first)
    if (dueSequences.length > 0) {
      dueSequences.sort((a, b) => a.card.due.getTime() - b.card.due.getTime());
      selectedKey = dueSequences[0].key;
    } else if (newSequences.length > 0) {
      // Then new sequences
      selectedKey = newSequences[0];
    }

    if (!selectedKey) {
      return null;
    }

    // Pick a random word with this sequence
    const wordsWithSequence = wordsBySequence.get(selectedKey);
    if (!wordsWithSequence || wordsWithSequence.length === 0) {
      return null;
    }

    const randomIndex = Math.floor(Math.random() * wordsWithSequence.length);
    return {
      word: wordsWithSequence[randomIndex],
      sequenceKey: selectedKey,
    };
  }, [allSequenceKeys, cardStates, wordsBySequence]);

  /**
   * Record a review for a tone sequence
   */
  const recordReview = useCallback((sequenceKey: string, correct: boolean): void => {
    const card = getCardForSequence(sequenceKey);
    const rating = correct ? Rating.Good : Rating.Again;
    const result = f.repeat(card, new Date());
    const newCard = result[rating].card;

    cardStates.set(sequenceKey, newCard);
    saveCardStates(cardStates);
  }, [cardStates, getCardForSequence]);

  /**
   * Get count of due sequences (not words)
   */
  const getDueCount = useCallback((): number => {
    const now = new Date();
    let count = 0;

    for (const key of allSequenceKeys) {
      const card = cardStates.get(key);
      if (!card || card.due <= now) {
        count++;
      }
    }

    return count;
  }, [allSequenceKeys, cardStates]);

  return {
    getNextWord,
    recordReview,
    getDueCount,
    getCardForSequence,
  };
}
