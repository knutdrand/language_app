import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { Word, Source } from '../types';
import { AudioButton } from './AudioButton';
import { ImageGrid } from './ImageGrid';
import { useFSRS } from '../hooks/useFSRS';
import { useProgress } from '../hooks/useProgress';
import { useAttemptLog } from '../hooks/useAttemptLog';

interface DrillProps {
  words: Word[];
  sources?: Source[];
}

function getRandomDistractors(words: Word[], excludeId: number, count: number): Word[] {
  const available = words.filter((w) => w.id !== excludeId);
  const shuffled = [...available].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export function Drill({ words, sources = [] }: DrillProps) {
  const { getNextWord, recordReview, getDueCount, isLoading } = useFSRS(words);

  // Get source for current word
  const getSourceForWord = useCallback((word: Word | null): Source | undefined => {
    if (!word?.sourceId) return undefined;
    return sources.find(s => s.id === word.sourceId);
  }, [sources]);
  const { recordReview: recordProgress, reviewsToday, correctToday } = useProgress();
  const { logDrillAttempt } = useAttemptLog();

  const [currentWord, setCurrentWord] = useState<Word | null>(null);
  const [distractors, setDistractors] = useState<Word[]>([]);
  const [showingFeedback, setShowingFeedback] = useState(false);
  const [lastResult, setLastResult] = useState<{ correct: boolean; word: Word } | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [key, setKey] = useState(0); // For forcing re-render of ImageGrid
  const attemptStartTime = useRef<number | null>(null);
  const hasLoadedInitial = useRef(false);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadNextWord = useCallback(() => {
    const next = getNextWord();
    if (next) {
      setCurrentWord(next);
      setDistractors(getRandomDistractors(words, next.id, 3));
      setShowingFeedback(false);
      setLastResult(null);
      setShowHint(false);
      setKey((k) => k + 1);
      attemptStartTime.current = Date.now();
    } else {
      setCurrentWord(null);
    }
  }, [getNextWord, words]);

  // Load first word when loading completes (only once)
  useEffect(() => {
    if (!isLoading && !hasLoadedInitial.current) {
      hasLoadedInitial.current = true;
      loadNextWord();
    }
  }, [isLoading, loadNextWord]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (advanceTimerRef.current) {
        clearTimeout(advanceTimerRef.current);
      }
    };
  }, []);

  const handleSelect = useCallback(
    (selectedWord: Word, isCorrect: boolean) => {
      if (!currentWord) return;

      // Prevent double-firing if already showing feedback
      if (showingFeedback) return;

      // Calculate response time
      const responseTimeMs = attemptStartTime.current
        ? Date.now() - attemptStartTime.current
        : undefined;

      // Log attempt to backend
      logDrillAttempt({
        wordId: currentWord.id,
        vietnamese: currentWord.vietnamese,
        english: currentWord.english,
        correctImageId: currentWord.id,
        selectedImageId: selectedWord.id,
        alternativeWordIds: distractors.map(d => d.id),
        isCorrect,
        responseTimeMs,
      });

      setLastResult({ correct: isCorrect, word: currentWord });
      setShowingFeedback(true);

      // Record with FSRS and progress
      recordReview(currentWord.id, isCorrect);
      recordProgress(isCorrect);

      // Clear any existing timer
      if (advanceTimerRef.current) {
        clearTimeout(advanceTimerRef.current);
      }

      // Auto-advance after delay
      advanceTimerRef.current = setTimeout(() => {
        advanceTimerRef.current = null;
        loadNextWord();
      }, 1500);
    },
    [currentWord, distractors, showingFeedback, recordReview, recordProgress, loadNextWord, logDrillAttempt]
  );

  const dueCount = useMemo(() => getDueCount(), [getDueCount, key]);
  const accuracy = reviewsToday > 0 ? Math.round((correctToday / reviewsToday) * 100) : 0;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 p-8 text-center">
        <div className="text-4xl animate-pulse">Loading...</div>
      </div>
    );
  }

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
            w-full p-3 rounded-xl text-center
            ${lastResult.correct ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}
          `}
        >
          <p className="font-semibold">
            {lastResult.correct ? '✓ Correct!' : `✗ It was "${lastResult.word.vietnamese}"`}
          </p>
          <p className="text-sm mt-1 opacity-80">
            {lastResult.word.vietnamese} = {lastResult.word.english}
          </p>
        </div>
      )}

      {/* Audio button */}
      <div className="my-4">
        <AudioButton wordId={currentWord.id} text={currentWord.vietnamese} autoPlay={!showingFeedback} />
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

      {/* Source link (for corpus words) */}
      {(() => {
        const source = getSourceForWord(currentWord);
        return source ? (
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-indigo-500 hover:text-indigo-700 transition-colors flex items-center gap-1"
          >
            <span>From: {source.title}</span>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        ) : null;
      })()}

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
