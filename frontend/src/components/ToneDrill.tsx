import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { Word, Source } from '../types';
import { AudioButton } from './AudioButton';
import { ToneGrid } from './ToneGrid';
import { useToneFSRS } from '../hooks/useToneFSRS';
import { useProgress } from '../hooks/useProgress';
import { useAttemptLog } from '../hooks/useAttemptLog';
import {
  type ToneId,
  getToneSequence,
  getDistractorSequences,
  getSingleDistractorSequence,
  formatToneSequence,
  formatToneSequenceDiacritics,
  getToneById,
} from '../utils/tones';

interface ToneDrillProps {
  words: Word[];
  sources?: Source[];
}

// Tone names for display
const TONE_NAMES = ['Level', 'Falling', 'Rising', 'Dipping', 'Creaky', 'Heavy'];

export function ToneDrill({ words, sources = [] }: ToneDrillProps) {
  // Use tone sequence-based FSRS tracking
  const {
    getNextWord,
    recordReview,
    getDueCount,
    getDifficultyLevel,
    getTargetPair,
    getPairSuccessProbability,
    getAllPairProbabilities,
    isLoading
  } = useToneFSRS(words);

  const getSourceForWord = useCallback(
    (word: Word | null): Source | undefined => {
      if (!word?.sourceId) return undefined;
      return sources.find((s) => s.id === word.sourceId);
    },
    [sources]
  );

  const { recordReview: recordProgress, reviewsToday, correctToday } = useProgress();
  const { logToneAttempt } = useAttemptLog();

  const [currentWord, setCurrentWord] = useState<Word | null>(null);
  const [currentSequenceKey, setCurrentSequenceKey] = useState<string | null>(null);
  const [correctSequence, setCorrectSequence] = useState<ToneId[]>([]);
  const [distractorSequences, setDistractorSequences] = useState<ToneId[][]>([]);
  const [showingFeedback, setShowingFeedback] = useState(false);
  const [lastResult, setLastResult] = useState<{
    correct: boolean;
    word: Word;
    correctSeq: ToneId[];
    pair: [number, number] | null;
    probBefore: number | null;
    probAfter: number | null;
  } | null>(null);
  const [key, setKey] = useState(0);
  const [currentPair, setCurrentPair] = useState<[number, number] | null>(null);
  const [pairProbBefore, setPairProbBefore] = useState<number | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const attemptStartTime = useRef<number | null>(null);
  const hasLoadedInitial = useRef(false);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadNextWord = useCallback(() => {
    const difficultyLevel = getDifficultyLevel();
    const targetPair = getTargetPair();

    const next = getNextWord();
    if (next) {
      const seq = getToneSequence(next.word.vietnamese);
      setCurrentWord(next.word);
      setCurrentSequenceKey(next.sequenceKey);
      setCorrectSequence(seq);

      // Set distractors based on difficulty level
      if (difficultyLevel === '2-choice') {
        // For 2-choice: use the weakest pair as the distractor
        const distractor = getSingleDistractorSequence(seq, targetPair as [ToneId, ToneId]);
        setDistractorSequences([distractor]);

        // Track the pair being drilled (0-indexed)
        const correctTone = seq[0] - 1;
        const distractorTone = distractor[0] - 1;
        const pair: [number, number] = correctTone < distractorTone
          ? [correctTone, distractorTone]
          : [distractorTone, correctTone];
        setCurrentPair(pair);
        setPairProbBefore(getPairSuccessProbability(pair[0], pair[1]));
      } else {
        // For 4-choice and multi-syllable: use 3 distractors
        setDistractorSequences(getDistractorSequences(seq));
        setCurrentPair(null);
        setPairProbBefore(null);
      }

      setShowingFeedback(false);
      setLastResult(null);
      setKey((k) => k + 1);
      attemptStartTime.current = Date.now();
    } else {
      setCurrentWord(null);
      setCurrentSequenceKey(null);
    }
  }, [getNextWord, getDifficultyLevel, getTargetPair, getPairSuccessProbability]);

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
    (selectedSequence: ToneId[], isCorrect: boolean) => {
      if (!currentWord || !currentSequenceKey) return;

      // Prevent double-firing if already showing feedback
      if (showingFeedback) return;

      // Calculate response time
      const responseTimeMs = attemptStartTime.current
        ? Date.now() - attemptStartTime.current
        : undefined;

      // Log attempt to backend
      logToneAttempt({
        wordId: currentWord.id,
        vietnamese: currentWord.vietnamese,
        english: currentWord.english,
        correctSequence,
        selectedSequence,
        alternatives: distractorSequences,
        isCorrect,
        responseTimeMs,
      });

      // Record with FSRS (by sequence key) and progress
      recordReview(currentSequenceKey, isCorrect);
      recordProgress(isCorrect);

      // Get the updated probability after recording the review
      const probAfter = currentPair ? getPairSuccessProbability(currentPair[0], currentPair[1]) : null;

      setLastResult({
        correct: isCorrect,
        word: currentWord,
        correctSeq: correctSequence,
        pair: currentPair,
        probBefore: pairProbBefore,
        probAfter,
      });
      setShowingFeedback(true);

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
    [currentWord, currentSequenceKey, correctSequence, distractorSequences, showingFeedback, recordReview, recordProgress, loadNextWord, logToneAttempt, currentPair, pairProbBefore, getPairSuccessProbability]
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
          You've reviewed all due tones. Come back later for more practice.
        </p>
        <div className="mt-4 p-4 bg-gray-100 rounded-xl">
          <p className="text-sm text-gray-500">Today's stats (Tone Mode)</p>
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
        <div className="flex items-center gap-2">
          <span>{reviewsToday} reviewed • {accuracy}%</span>
          <button
            onClick={() => setShowTooltip(!showTooltip)}
            className="px-2 py-1 text-xs bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200 transition-colors"
          >
            {showTooltip ? 'Hide' : 'Stats'}
          </button>
        </div>
      </div>

      {/* Collapsible pair probabilities */}
      {showTooltip && (() => {
        const pairData = getAllPairProbabilities();
        const totalAttempts = pairData.reduce((sum, p) => sum + p.attempts, 0);
        return (
          <div className="w-full bg-gray-50 rounded-lg p-3 border border-gray-200">
            <div className="flex justify-between items-center mb-2">
              <p className="text-xs font-semibold text-gray-700">Pair Success Probabilities</p>
              <p className="text-xs text-gray-500">
                Total: {totalAttempts}/100
                {totalAttempts >= 100 ? ' ✓' : ''}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs">
              {pairData.map(({ pair, probability, attempts }) => {
                const pct = Math.round(probability * 100);
                const colorClass =
                  pct >= 80 ? 'text-green-600' :
                  pct >= 60 ? 'text-yellow-600' :
                  'text-red-600';
                return (
                  <div key={`${pair[0]}-${pair[1]}`} className="flex justify-between">
                    <span className="text-gray-600">{TONE_NAMES[pair[0]]}/{TONE_NAMES[pair[1]]}:</span>
                    <span className={colorClass}>{pct}% <span className="text-gray-400">({attempts})</span></span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Feedback banner */}
      {lastResult && (
        <div
          className={`
            w-full p-3 rounded-xl text-center
            ${lastResult.correct ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}
          `}
        >
          <p className="font-semibold">
            {lastResult.correct
              ? '✓ Correct!'
              : `✗ The tones were: ${formatToneSequence(lastResult.correctSeq)}`}
          </p>
          <p className="text-sm mt-1 opacity-80">
            {lastResult.word.vietnamese} ({formatToneSequenceDiacritics(lastResult.correctSeq)})
          </p>
          {/* Pair probability update for 2-choice mode */}
          {lastResult.pair !== null && lastResult.probBefore !== null && lastResult.probAfter !== null && (
            <p className="text-xs mt-2 font-medium">
              {TONE_NAMES[lastResult.pair[0]]}/{TONE_NAMES[lastResult.pair[1]]}:{' '}
              {Math.round(lastResult.probBefore * 100)}% →{' '}
              <span className={lastResult.probAfter > lastResult.probBefore ? 'text-green-700' : 'text-red-700'}>
                {Math.round(lastResult.probAfter * 100)}%
              </span>
            </p>
          )}
        </div>
      )}

      {/* Audio button */}
      <div className="my-4">
        <AudioButton wordId={currentWord.id} text={currentWord.vietnamese} autoPlay={!showingFeedback} />
      </div>

      {/* English meaning only (no Vietnamese spelling to avoid giving away tones) */}
      <div className="text-center">
        <p className="text-lg text-gray-600">{currentWord.english}</p>
      </div>

      {/* Source link */}
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
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
          </a>
        ) : null;
      })()}

      {/* Instruction */}
      <p className="text-gray-500 text-sm">Select the correct tone sequence:</p>

      {/* Tone grid */}
      <ToneGrid
        key={key}
        correctSequence={correctSequence}
        distractorSequences={distractorSequences}
        onSelect={handleSelect}
        disabled={showingFeedback}
      />
    </div>
  );
}
