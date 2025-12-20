import { useState, useCallback, useRef, useEffect } from 'react';
import type { Source } from '../types';
import { AudioButton } from './AudioButton';
import { ToneGrid } from './ToneGrid';
import {
  useToneDrillApi,
  type PreviousAnswer,
  type DifficultyLevel,
} from '../hooks/useToneDrillApi';
import {
  type ToneId,
  formatToneSequence,
  formatToneSequenceDiacritics,
  sequencesEqual,
} from '../utils/tones';

interface ToneDrillProps {
  sources?: Source[];
}

// Tone names for display
const TONE_NAMES = ['Level', 'Falling', 'Rising', 'Dipping', 'Creaky', 'Heavy'];

export function ToneDrill({ sources = [] }: ToneDrillProps) {
  const {
    drill,
    stats,
    difficultyLevel,
    isLoading,
    error,
    submitAnswer,
  } = useToneDrillApi();

  const [showingFeedback, setShowingFeedback] = useState(false);
  const [lastResult, setLastResult] = useState<{
    correct: boolean;
    vietnamese: string;
    correctSeq: ToneId[];
    pair: [number, number] | null;
    probBefore: number | null;
    probAfter: number | null;
  } | null>(null);
  const [key, setKey] = useState(0);
  const [showTooltip, setShowTooltip] = useState(false);
  const attemptStartTime = useRef<number | null>(null);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track pair probability before answer for 2-choice mode
  const [currentPairProbBefore, setCurrentPairProbBefore] = useState<number | null>(null);

  // Reset attempt timer when drill changes
  useEffect(() => {
    if (drill) {
      attemptStartTime.current = Date.now();
      setShowingFeedback(false);
      setLastResult(null);
      setKey((k) => k + 1);

      // Track the pair probability before answer for 2-choice mode
      if (difficultyLevel === '2-choice' && stats) {
        const correctSeq = drill.correct_sequence;
        const alternatives = drill.alternatives;
        // Find the pair being drilled (0-indexed)
        if (alternatives.length === 2 && correctSeq.length === 1) {
          const pair: [number, number] = [
            Math.min(alternatives[0][0] - 1, alternatives[1][0] - 1),
            Math.max(alternatives[0][0] - 1, alternatives[1][0] - 1),
          ];
          const pairProb = stats.pair_probabilities.find(
            (p) => p.pair[0] === pair[0] && p.pair[1] === pair[1]
          );
          setCurrentPairProbBefore(pairProb?.probability ?? null);
        } else {
          setCurrentPairProbBefore(null);
        }
      } else {
        setCurrentPairProbBefore(null);
      }
    }
  }, [drill, difficultyLevel, stats]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (advanceTimerRef.current) {
        clearTimeout(advanceTimerRef.current);
      }
    };
  }, []);

  const getSourceForWord = useCallback(
    (sourceId: string | undefined): Source | undefined => {
      if (!sourceId) return undefined;
      return sources.find((s) => s.id === sourceId);
    },
    [sources]
  );

  const handleSelect = useCallback(
    async (selectedSequence: ToneId[], isCorrect: boolean) => {
      if (!drill) return;

      // Prevent double-firing if already showing feedback
      if (showingFeedback) return;

      // Calculate response time
      const responseTimeMs = attemptStartTime.current
        ? Date.now() - attemptStartTime.current
        : undefined;

      // Prepare answer for submission
      const answer: PreviousAnswer = {
        word_id: drill.word_id,
        correct_sequence: drill.correct_sequence,
        selected_sequence: selectedSequence as number[],
        alternatives: drill.alternatives,
        response_time_ms: responseTimeMs,
      };

      // Find the pair being drilled for 2-choice mode
      let pair: [number, number] | null = null;
      if (difficultyLevel === '2-choice' && drill.alternatives.length === 2 && drill.correct_sequence.length === 1) {
        pair = [
          Math.min(drill.alternatives[0][0] - 1, drill.alternatives[1][0] - 1),
          Math.max(drill.alternatives[0][0] - 1, drill.alternatives[1][0] - 1),
        ];
      }

      setLastResult({
        correct: isCorrect,
        vietnamese: drill.vietnamese,
        correctSeq: drill.correct_sequence as ToneId[],
        pair,
        probBefore: currentPairProbBefore,
        probAfter: null, // Will be updated after submission
      });
      setShowingFeedback(true);

      // Clear any existing timer
      if (advanceTimerRef.current) {
        clearTimeout(advanceTimerRef.current);
      }

      // Submit answer and get next drill after delay
      advanceTimerRef.current = setTimeout(async () => {
        advanceTimerRef.current = null;
        try {
          const response = await submitAnswer(answer);

          // Update the probability after for feedback
          if (pair && response.stats) {
            const pairProb = response.stats.pair_probabilities.find(
              (p) => p.pair[0] === pair![0] && p.pair[1] === pair![1]
            );
            setLastResult((prev) =>
              prev ? { ...prev, probAfter: pairProb?.probability ?? null } : null
            );
          }
        } catch (e) {
          console.error('Failed to submit answer:', e);
        }
      }, 1500);
    },
    [drill, showingFeedback, difficultyLevel, currentPairProbBefore, submitAnswer]
  );

  // Compute distractors from alternatives
  const getDistractorSequences = (): ToneId[][] => {
    if (!drill) return [];
    const correct = drill.correct_sequence;
    return drill.alternatives
      .filter((alt) => !sequencesEqual(alt as ToneId[], correct as ToneId[]))
      .map((alt) => alt as ToneId[]);
  };

  const accuracy =
    stats && stats.reviews_today > 0
      ? Math.round((stats.correct_today / stats.reviews_today) * 100)
      : 0;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 p-8 text-center">
        <div className="text-4xl animate-pulse">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 p-8 text-center">
        <div className="text-6xl">❌</div>
        <h2 className="text-2xl font-bold text-red-800">Error</h2>
        <p className="text-gray-600">{error.message}</p>
        <p className="text-sm text-gray-500">Please make sure you are logged in.</p>
      </div>
    );
  }

  if (!drill) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 p-8 text-center">
        <div className="text-6xl">🎉</div>
        <h2 className="text-2xl font-bold text-gray-800">All done for now!</h2>
        <p className="text-gray-600">
          You've reviewed all due tones. Come back later for more practice.
        </p>
        {stats && (
          <div className="mt-4 p-4 bg-gray-100 rounded-xl">
            <p className="text-sm text-gray-500">Today's stats (Tone Mode)</p>
            <p className="text-xl font-semibold">
              {stats.reviews_today} reviews • {accuracy}% accuracy
            </p>
          </div>
        )}
      </div>
    );
  }

  const correctSequence = drill.correct_sequence as ToneId[];
  const distractorSequences = getDistractorSequences();

  return (
    <div className="flex flex-col items-center gap-6 p-4 w-full max-w-lg mx-auto">
      {/* Progress bar */}
      <div className="w-full flex items-center justify-between text-sm text-gray-500">
        <span>Mode: {difficultyLevel}</span>
        <div className="flex items-center gap-2">
          <span>
            {stats?.reviews_today ?? 0} reviewed • {accuracy}%
          </span>
          <button
            onClick={() => setShowTooltip(!showTooltip)}
            className="px-2 py-1 text-xs bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200 transition-colors"
          >
            {showTooltip ? 'Hide' : 'Stats'}
          </button>
        </div>
      </div>

      {/* Collapsible probabilities */}
      {showTooltip && stats && (
        <StatsPanel
          difficultyLevel={difficultyLevel}
          pairProbabilities={stats.pair_probabilities}
          fourChoiceProbabilities={stats.four_choice_probabilities}
        />
      )}

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
            {lastResult.vietnamese} ({formatToneSequenceDiacritics(lastResult.correctSeq)})
          </p>
          {/* Pair probability update for 2-choice mode */}
          {lastResult.pair !== null &&
            lastResult.probBefore !== null &&
            lastResult.probAfter !== null && (
              <p className="text-xs mt-2 font-medium">
                {TONE_NAMES[lastResult.pair[0]]}/{TONE_NAMES[lastResult.pair[1]]}:{' '}
                {Math.round(lastResult.probBefore * 100)}% →{' '}
                <span
                  className={
                    lastResult.probAfter > lastResult.probBefore
                      ? 'text-green-700'
                      : 'text-red-700'
                  }
                >
                  {Math.round(lastResult.probAfter * 100)}%
                </span>
              </p>
            )}
        </div>
      )}

      {/* Audio button */}
      <div className="my-4">
        <AudioButton
          wordId={drill.word_id}
          text={drill.vietnamese}
          autoPlay={!showingFeedback}
        />
      </div>

      {/* English meaning only */}
      <div className="text-center">
        <p className="text-lg text-gray-600">{drill.english}</p>
      </div>

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

// Stats panel component
interface StatsPanelProps {
  difficultyLevel: DifficultyLevel;
  pairProbabilities: { pair: number[]; probability: number; correct: number; total: number }[];
  fourChoiceProbabilities: { set: number[]; probability: number }[];
}

function StatsPanel({
  difficultyLevel,
  pairProbabilities,
  fourChoiceProbabilities,
}: StatsPanelProps) {
  if (difficultyLevel === '2-choice') {
    const totalAttempts = pairProbabilities.reduce((sum, p) => sum + p.total, 0);
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
          {pairProbabilities.map(({ pair, probability, correct, total }) => {
            const pct = Math.round(probability * 100);
            const colorClass =
              pct >= 80 ? 'text-green-600' : pct >= 60 ? 'text-yellow-600' : 'text-red-600';
            return (
              <div key={`${pair[0]}-${pair[1]}`} className="flex justify-between">
                <span className="text-gray-600">
                  {TONE_NAMES[pair[0]]}/{TONE_NAMES[pair[1]]}:
                </span>
                <span className={colorClass}>
                  {pct}% <span className="text-gray-400">({correct}/{total})</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  } else {
    // 4-choice mode: show 4-choice set probabilities
    return (
      <div className="w-full bg-gray-50 rounded-lg p-3 border border-gray-200">
        <p className="text-xs font-semibold text-gray-700 mb-2">4-Choice Set Probabilities</p>
        <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs">
          {fourChoiceProbabilities.map(({ set, probability }) => {
            const pct = Math.round(probability * 100);
            const colorClass =
              pct >= 80 ? 'text-green-600' : pct >= 60 ? 'text-yellow-600' : 'text-red-600';
            const label = set.map((t) => TONE_NAMES[t][0]).join('/');
            return (
              <div key={set.join('-')} className="flex justify-between gap-2">
                <span className="text-gray-600 truncate">{label}:</span>
                <span className={`${colorClass} flex-shrink-0`}>{pct}%</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
}
