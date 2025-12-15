import { useCallback, useMemo, useState, useEffect } from 'react';
import { createEmptyCard, fsrs, Rating, type Card } from 'ts-fsrs';
import type { Word, DrillMode } from '../types';
import { API_BASE_URL } from '../config';

const f = fsrs();

interface BackendCardState {
  word_id: number;
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
}

function fromBackend(backend: BackendCardState): { wordId: number; card: Card } {
  return {
    wordId: backend.word_id,
    card: {
      ...backend.card,
      due: new Date(backend.card.due),
      last_review: backend.card.last_review ? new Date(backend.card.last_review) : undefined,
    } as Card,
  };
}

function toBackend(wordId: number, card: Card): BackendCardState {
  return {
    word_id: wordId,
    card: {
      ...card,
      due: card.due.toISOString(),
      last_review: card.last_review?.toISOString(),
    } as BackendCardState['card'],
  };
}

export function useFSRS(words: Word[], _mode: DrillMode = 'image') {
  const [cardStates, setCardStates] = useState<Map<number, Card>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  // Load from backend on mount
  useEffect(() => {
    async function loadFromBackend() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/fsrs/word-cards`);
        if (response.ok) {
          const data = await response.json();
          const map = new Map<number, Card>();
          for (const cardData of data.cards) {
            const { wordId, card } = fromBackend(cardData);
            map.set(wordId, card);
          }
          setCardStates(map);
        }
      } catch (e) {
        console.error('Failed to load word cards from backend:', e);
      } finally {
        setIsLoading(false);
      }
    }
    loadFromBackend();
  }, []);

  // Save single card to backend
  const saveCardToBackend = useCallback(async (wordId: number, card: Card) => {
    try {
      await fetch(`${API_BASE_URL}/api/fsrs/word-cards/${wordId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toBackend(wordId, card)),
      });
    } catch (e) {
      console.error('Failed to save word card to backend:', e);
    }
  }, []);

  const getCardForWord = useCallback((wordId: number): Card => {
    const existing = cardStates.get(wordId);
    if (existing) return existing;
    return createEmptyCard();
  }, [cardStates]);

  const getNextWord = useCallback((): Word | null => {
    if (isLoading) return null;

    const now = new Date();
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

    if (dueWords.length > 0) {
      dueWords.sort((a, b) => a.card.due.getTime() - b.card.due.getTime());
      return dueWords[0].word;
    }

    if (newWords.length > 0) {
      return newWords[0];
    }

    return null;
  }, [words, cardStates, isLoading]);

  const recordReview = useCallback((wordId: number, correct: boolean): void => {
    const card = getCardForWord(wordId);
    const rating = correct ? Rating.Good : Rating.Again;
    const result = f.repeat(card, new Date());
    const newCard = result[rating].card;

    // Update local state
    setCardStates(prev => {
      const newMap = new Map(prev);
      newMap.set(wordId, newCard);
      return newMap;
    });

    // Save to backend
    saveCardToBackend(wordId, newCard);
  }, [getCardForWord, saveCardToBackend]);

  const getDueCount = useCallback((): number => {
    if (isLoading) return 0;

    const now = new Date();
    let count = 0;

    for (const word of words) {
      const card = cardStates.get(word.id);
      if (!card || card.due <= now) {
        count++;
      }
    }

    return count;
  }, [words, cardStates, isLoading]);

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
    isLoading,
  };
}
