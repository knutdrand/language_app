import { useState, useCallback, useMemo, useEffect } from 'react';
import type { Word, Source } from '../types';
import { AudioButton } from './AudioButton';
import { ToneGrid } from './ToneGrid';
import { useToneFSRS } from '../hooks/useToneFSRS';
import { useProgress } from '../hooks/useProgress';
import {
  type ToneId,
  getToneSequence,
  getDistractorSequences,
  formatToneSequence,
  formatToneSequenceDiacritics,
} from '../utils/tones';

interface ToneDrillProps {
  words: Word[];
  sources?: Source[];
}

export function ToneDrill({ words, sources = [] }: ToneDrillProps) {
  // Use tone sequence-based FSRS tracking
  const { getNextWord, recordReview, getDueCount } = useToneFSRS(words);

  const getSourceForWord = useCallback(
    (word: Word | null): Source | undefined => {
      if (!word?.sourceId) return undefined;
      return sources.find((s) => s.id === word.sourceId);
    },
    [sources]
  );

  const { recordReview: recordProgress, reviewsToday, correctToday } = useProgress();

  const [currentWord, setCurrentWord] = useState<Word | null>(null);
  const [currentSequenceKey, setCurrentSequenceKey] = useState<string | null>(null);
  const [correctSequence, setCorrectSequence] = useState<ToneId[]>([]);
  const [distractorSequences, setDistractorSequences] = useState<ToneId[][]>([]);
  const [showingFeedback, setShowingFeedback] = useState(false);
  const [lastResult, setLastResult] = useState<{
    correct: boolean;
    word: Word;
    correctSeq: ToneId[];
  } | null>(null);
  const [key, setKey] = useState(0);

  const loadNextWord = useCallback(() => {
    const next = getNextWord();
    if (next) {
      const seq = getToneSequence(next.word.vietnamese);
      setCurrentWord(next.word);
      setCurrentSequenceKey(next.sequenceKey);
      setCorrectSequence(seq);
      setDistractorSequences(getDistractorSequences(seq));
      setShowingFeedback(false);
      setLastResult(null);
      setKey((k) => k + 1);
    } else {
      setCurrentWord(null);
      setCurrentSequenceKey(null);
    }
  }, [getNextWord]);

  // Load first word on mount
  useEffect(() => {
    loadNextWord();
  }, []);

  const handleSelect = useCallback(
    (_selectedSequence: ToneId[], isCorrect: boolean) => {
      if (!currentWord || !currentSequenceKey) return;

      setLastResult({ correct: isCorrect, word: currentWord, correctSeq: correctSequence });
      setShowingFeedback(true);

      // Record with FSRS (by sequence key) and progress
      recordReview(currentSequenceKey, isCorrect);
      recordProgress(isCorrect);

      // Auto-advance after delay
      setTimeout(() => {
        loadNextWord();
      }, 1500);
    },
    [currentWord, currentSequenceKey, correctSequence, recordReview, recordProgress, loadNextWord]
  );

  const dueCount = useMemo(() => getDueCount(), [getDueCount, key]);
  const accuracy = reviewsToday > 0 ? Math.round((correctToday / reviewsToday) * 100) : 0;

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
            {lastResult.correct
              ? '✓ Correct!'
              : `✗ The tones were: ${formatToneSequence(lastResult.correctSeq)}`}
          </p>
          <p className="text-sm mt-1 opacity-80">
            {lastResult.word.vietnamese} ({formatToneSequenceDiacritics(lastResult.correctSeq)})
          </p>
        </div>
      )}

      {/* Audio button */}
      <div className="my-4">
        <AudioButton text={currentWord.vietnamese} autoPlay={!showingFeedback} />
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
