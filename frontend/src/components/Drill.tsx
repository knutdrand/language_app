import { useState, useCallback, useMemo, useEffect } from 'react';
import type { Word } from '../types';
import { AudioButton } from './AudioButton';
import { ImageGrid } from './ImageGrid';
import { useFSRS } from '../hooks/useFSRS';
import { useProgress } from '../hooks/useProgress';

interface DrillProps {
  words: Word[];
}

function getRandomDistractors(words: Word[], excludeId: number, count: number): Word[] {
  const available = words.filter((w) => w.id !== excludeId);
  const shuffled = [...available].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export function Drill({ words }: DrillProps) {
  const { getNextWord, recordReview, getDueCount } = useFSRS(words);
  const { recordReview: recordProgress, reviewsToday, correctToday } = useProgress();

  const [currentWord, setCurrentWord] = useState<Word | null>(null);
  const [distractors, setDistractors] = useState<Word[]>([]);
  const [showingFeedback, setShowingFeedback] = useState(false);
  const [lastResult, setLastResult] = useState<{ correct: boolean; word: Word } | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [key, setKey] = useState(0); // For forcing re-render of ImageGrid

  const loadNextWord = useCallback(() => {
    const next = getNextWord();
    if (next) {
      setCurrentWord(next);
      setDistractors(getRandomDistractors(words, next.id, 3));
      setShowingFeedback(false);
      setLastResult(null);
      setShowHint(false);
      setKey((k) => k + 1);
    } else {
      setCurrentWord(null);
    }
  }, [getNextWord, words]);

  // Load first word on mount
  useEffect(() => {
    loadNextWord();
  }, []);

  const handleSelect = useCallback(
    (_selectedWord: Word, isCorrect: boolean) => {
      if (!currentWord) return;

      setLastResult({ correct: isCorrect, word: currentWord });
      setShowingFeedback(true);

      // Record with FSRS and progress
      recordReview(currentWord.id, isCorrect);
      recordProgress(isCorrect);

      // Auto-advance after delay
      setTimeout(() => {
        loadNextWord();
      }, 1500);
    },
    [currentWord, recordReview, recordProgress, loadNextWord]
  );

  const dueCount = useMemo(() => getDueCount(), [getDueCount, key]);
  const accuracy = reviewsToday > 0 ? Math.round((correctToday / reviewsToday) * 100) : 0;

  if (!currentWord) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 p-8 text-center">
        <div className="text-6xl">🎉</div>
        <h2 className="text-2xl font-bold text-gray-800">All done for now!</h2>
        <p className="text-gray-600">
          You've reviewed all due words. Come back later for more practice.
        </p>
        <div className="mt-4 p-4 bg-gray-100 rounded-xl">
          <p className="text-sm text-gray-500">Today's stats</p>
          <p className="text-xl font-semibold">
            {reviewsToday} reviews • {accuracy}% accuracy
          </p>
        </div>
        <button
          onClick={loadNextWord}
          className="mt-4 px-6 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors"
        >
          Check for more
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 p-4 w-full max-w-lg mx-auto">
      {/* Progress bar */}
      <div className="w-full flex items-center justify-between text-sm text-gray-500">
        <span>{dueCount} cards due</span>
        <span>
          {reviewsToday} reviewed • {accuracy}% accuracy
        </span>
      </div>

      {/* Feedback banner */}
      {lastResult && (
        <div
          className={`
            w-full p-3 rounded-xl text-center font-semibold
            ${lastResult.correct ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}
          `}
        >
          {lastResult.correct ? '✓ Correct!' : `✗ It was "${lastResult.word.vietnamese}"`}
        </div>
      )}

      {/* Audio button */}
      <div className="my-4">
        <AudioButton text={currentWord.vietnamese} autoPlay={!showingFeedback} />
      </div>

      {/* Hint: Vietnamese text (on demand) */}
      {showHint ? (
        <p className="text-gray-600 text-lg font-medium">
          {currentWord.vietnamese}
        </p>
      ) : (
        <button
          onClick={() => setShowHint(true)}
          className="text-gray-400 text-sm hover:text-gray-600 transition-colors"
        >
          Show text hint
        </button>
      )}

      {/* Image grid */}
      <ImageGrid
        key={key}
        correctWord={currentWord}
        distractors={distractors}
        onSelect={handleSelect}
        disabled={showingFeedback}
      />
    </div>
  );
}
