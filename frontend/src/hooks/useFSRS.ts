import { useCallback, useMemo } from 'react';
import { createEmptyCard, fsrs, Rating, type Card } from 'ts-fsrs';
import type { Word, CardState, DrillMode } from '../types';

const STORAGE_KEY_BASE = 'language_app_cards';

const f = fsrs();

function getStorageKey(mode: DrillMode): string {
  return mode === 'image' ? STORAGE_KEY_BASE : `${STORAGE_KEY_BASE}_${mode}`;
}

function loadCardStates(mode: DrillMode): Map<number, Card> {
  try {
    const stored = localStorage.getItem(getStorageKey(mode));
    if (stored) {
      const parsed = JSON.parse(stored) as CardState[];
      const map = new Map<number, Card>();
      for (const state of parsed) {
        // Restore Date objects from JSON
        const card: Card = {
          ...state.card,
          due: new Date(state.card.due),
          last_review: state.card.last_review ? new Date(state.card.last_review) : undefined,
        };
        map.set(state.wordId, card);
      }
      return map;
    }
  } catch (e) {
    console.error('Failed to load card states:', e);
  }
  return new Map();
}

function saveCardStates(cards: Map<number, Card>, mode: DrillMode): void {
  const states: CardState[] = [];
  cards.forEach((card, wordId) => {
    states.push({ wordId, card });
  });
  localStorage.setItem(getStorageKey(mode), JSON.stringify(states));
}

export function useFSRS(words: Word[], mode: DrillMode = 'image') {
  const cardStates = useMemo(() => loadCardStates(mode), [mode]);

  const getCardForWord = useCallback((wordId: number): Card => {
    const existing = cardStates.get(wordId);
    if (existing) return existing;

    const newCard = createEmptyCard();
    cardStates.set(wordId, newCard);
    return newCard;
  }, [cardStates]);

  const getNextWord = useCallback((): Word | null => {
    const now = new Date();

    // Find words that are due for review
    const dueWords: { word: Word; card: Card }[] = [];
    const newWords: Word[] = [];

    for (const word of words) {
      const card = cardStates.get(word.id);
      if (!card) {
        newWords.push(word);
      } else if (card.due <= now) {
        dueWords.push({ word, card });
      }
    }

    // Prioritize due words (sorted by due date, oldest first)
    if (dueWords.length > 0) {
      dueWords.sort((a, b) => a.card.due.getTime() - b.card.due.getTime());
      return dueWords[0].word;
    }

    // Then introduce new words
    if (newWords.length > 0) {
      return newWords[0];
    }

    // Nothing due - return null or the word due soonest
    return null;
  }, [words, cardStates]);

  const recordReview = useCallback((wordId: number, correct: boolean): void => {
    const card = getCardForWord(wordId);
    const rating = correct ? Rating.Good : Rating.Again;
    const result = f.repeat(card, new Date());
    const newCard = result[rating].card;

    cardStates.set(wordId, newCard);
    saveCardStates(cardStates, mode);
  }, [cardStates, getCardForWord, mode]);

  const getDueCount = useCallback((): number => {
    const now = new Date();
    let count = 0;

    for (const word of words) {
      const card = cardStates.get(word.id);
      if (!card || card.due <= now) {
        count++;
      }
    }

    return count;
  }, [words, cardStates]);

  const getReviewedTodayCount = useCallback((): number => {
    const today = new Date().toDateString();
    let count = 0;

    cardStates.forEach((card) => {
      if (card.last_review && card.last_review.toDateString() === today) {
        count++;
      }
    });

    return count;
  }, [cardStates]);

  return {
    getNextWord,
    recordReview,
    getDueCount,
    getReviewedTodayCount,
    getCardForWord,
  };
}
