import { useState, useCallback, useRef, useEffect } from 'react';
import { AudioButton } from './AudioButton';
import { ToneGrid } from './ToneGrid';
import {
  useDrillApi,
  type PreviousAnswer,
  type FourChoiceStats,
} from '../hooks/useDrillApi';
import {
  type ToneId,
  formatToneSequence,
  formatToneSequenceDiacritics,
  sequencesEqual,
} from '../utils/tones';

// Tone names for display
const TONE_NAMES = ['Level', 'Falling', 'Rising', 'Dipping', 'Creaky', 'Heavy'];
// Tone abbreviations for 4-choice stats (1-indexed)
const TONE_ABBREV: { [key: number]: string } = {
  1: 'L',  // Level
  2: 'F',  // Falling
  3: 'R',  // Rising
  4: 'D',  // Dipping
  5: 'C',  // Creaky
  6: 'H',  // Heavy
};

export function ToneDrill() {
  const {
    drill,
    pairStats,
    fourChoiceStats,
    legacyPairProbabilities,
    difficultyLevel,
    isLoading,
    error,
    submitAnswer,
    getPairProbability,
  } = useDrillApi('tone');

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
  // Track reviews for session stats (since backend no longer sends these)
  const [sessionReviews, setSessionReviews] = useState(0);
  const [sessionCorrect, setSessionCorrect] = useState(0);

  // Reset attempt timer when drill changes
  useEffect(() => {
    if (drill) {
      attemptStartTime.current = Date.now();
      setShowingFeedback(false);
      setLastResult(null);
      setKey((k) => k + 1);

      // Track the pair probability before answer for 2-choice mode
      if (difficultyLevel === '2-choice' && pairStats.length > 0) {
        const correctSeq = drill.correct_sequence;
        const alternatives = drill.alternatives;
        // Find the pair being drilled (1-indexed in new API)
        if (alternatives.length === 2 && correctSeq.length === 1) {
          const pair: [number, number] = [
            Math.min(alternatives[0][0], alternatives[1][0]),
            Math.max(alternatives[0][0], alternatives[1][0]),
          ];
          const prob = getPairProbability(pair);
          setCurrentPairProbBefore(prob);
        } else {
          setCurrentPairProbBefore(null);
        }
      } else {
        setCurrentPairProbBefore(null);
      }
    }
  }, [drill, difficultyLevel, pairStats, getPairProbability]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (advanceTimerRef.current) {
        clearTimeout(advanceTimerRef.current);
      }
    };
  }, []);

  const handleSelect = useCallback(
    async (selectedSequence: ToneId[], isCorrect: boolean) => {
      if (!drill) return;

      // Prevent double-firing if already showing feedback
      if (showingFeedback) return;

      // Calculate response time
      const responseTimeMs = attemptStartTime.current
        ? Date.now() - attemptStartTime.current
        : undefined;

      // Prepare answer for submission (new format with problem_type_id)
      const answer: PreviousAnswer = {
        problem_type_id: drill.problem_type_id,
        word_id: drill.word_id,
        correct_sequence: drill.correct_sequence,
        selected_sequence: selectedSequence as number[],
        alternatives: drill.alternatives,
        response_time_ms: responseTimeMs,
      };

      // Find the pair being drilled for 2-choice mode (1-indexed now)
      let pair: [number, number] | null = null;
      if (difficultyLevel === '2-choice' && drill.alternatives.length === 2 && drill.correct_sequence.length === 1) {
        pair = [
          Math.min(drill.alternatives[0][0], drill.alternatives[1][0]),
          Math.max(drill.alternatives[0][0], drill.alternatives[1][0]),
        ];
      }

      // Update session stats
      setSessionReviews((r) => r + 1);
      if (isCorrect) {
        setSessionCorrect((c) => c + 1);
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

          // Update the probability after for feedback (1-indexed pairs now)
          if (pair && response.pair_stats) {
            const pairStat = response.pair_stats.find(
              (p) =>
                (p.pair[0] === pair![0] && p.pair[1] === pair![1]) ||
                (p.pair[0] === pair![1] && p.pair[1] === pair![0])
            );
            setLastResult((prev) =>
              prev ? { ...prev, probAfter: pairStat?.mean ?? null } : null
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
    sessionReviews > 0
      ? Math.round((sessionCorrect / sessionReviews) * 100)
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
        {sessionReviews > 0 && (
          <div className="mt-4 p-4 bg-gray-100 rounded-xl">
            <p className="text-sm text-gray-500">Session stats (Tone Mode)</p>
            <p className="text-xl font-semibold">
              {sessionReviews} reviews • {accuracy}% accuracy
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
        <span>Mode: {
          difficultyLevel === '2-choice' ? '2-choice (1-syl)' :
          difficultyLevel === 'mixed' ? 'Mixed (4-choice 1-syl / 2-choice 2-syl)' :
          difficultyLevel === '4-choice-multi' ? '4-choice (2-syl)' :
          difficultyLevel
        }</span>
        <div className="flex items-center gap-2">
          <span>
            {sessionReviews} reviewed • {accuracy}%
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
      {showTooltip && pairStats.length > 0 && (
        <StatsPanel
          pairProbabilities={legacyPairProbabilities}
          fourChoiceStats={fourChoiceStats}
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
  pairProbabilities: { pair: [number, number]; probability: number; correct: number; total: number }[];
  fourChoiceStats: FourChoiceStats[];
}

function StatsPanel({
  pairProbabilities,
  fourChoiceStats,
}: StatsPanelProps) {

  // Format a 4-choice set as abbreviations (e.g., "F/R/D/C")
  const formatSet = (set: number[]): string => {
    return set.map(id => TONE_ABBREV[id] || '?').join('/');
  };

  return (
    <div className="w-full bg-gray-50 rounded-lg p-3 border border-gray-200">
      {/* 2-choice pair stats */}
      <div className="flex justify-between items-center mb-2">
        <p className="text-xs font-semibold text-gray-700">
          Pair Success (2-choice)
        </p>
        <p className="text-xs text-gray-500">
          {pairProbabilities.filter(p => Math.round(p.probability * 100) >= 80).length}/{pairProbabilities.length} mastered
        </p>
      </div>
      <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs mb-3">
        {pairProbabilities.map(({ pair, probability }) => {
          const pct = Math.round(probability * 100);
          const colorClass =
            pct >= 80 ? 'text-green-600' : pct >= 60 ? 'text-yellow-600' : 'text-red-600';
          return (
            <div key={`${pair[0]}-${pair[1]}`} className="flex justify-between">
              <span className="text-gray-600">
                {TONE_NAMES[pair[0]]}/{TONE_NAMES[pair[1]]}:
              </span>
              <span className={colorClass}>{pct}%</span>
            </div>
          );
        })}
      </div>

      {/* 4-choice set stats */}
      {fourChoiceStats.length > 0 && (
        <>
          <div className="flex justify-between items-center mb-2 pt-2 border-t border-gray-200">
            <p className="text-xs font-semibold text-gray-700">
              Set Success (4-choice)
            </p>
            <p className="text-xs text-gray-500">
              {fourChoiceStats.filter(s => Math.round(s.mean * 100) >= 90).length}/{fourChoiceStats.length} mastered
            </p>
          </div>
          <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs">
            {fourChoiceStats.map((stat) => {
              const pct = Math.round(stat.mean * 100);
              const colorClass =
                pct >= 90 ? 'text-green-600' : pct >= 70 ? 'text-yellow-600' : 'text-red-600';
              return (
                <div key={stat.set.join('-')} className="flex justify-between">
                  <span className="text-gray-600 font-mono">
                    {formatSet(stat.set)}:
                  </span>
                  <span className={colorClass}>{pct}%</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
