import { useState, useCallback, useRef, useEffect } from 'react';
import { AudioButton } from './AudioButton';
import { ToneGrid } from './ToneGrid';
import {
  useLessonApi,
  fetchLessonThemes,
  type ThemeInfo,
  type LessonSummary,
} from '../hooks/useLessonApi';
import {
  type ToneId,
  formatToneSequence,
  formatToneSequenceDiacritics,
  sequencesEqual,
} from '../utils/tones';
import { useProgress } from '../hooks/useProgress';

// Tone names for display (0-indexed for display purposes)
const TONE_NAMES = ['Level', 'Falling', 'Rising', 'Dipping', 'Creaky', 'Heavy'];

// Theme descriptions
const THEME_DESCRIPTIONS: { [key: number]: string } = {
  0: 'Level vs Falling/Rising',
  1: 'Falling vs Rising/Dipping',
  2: 'Rising/Dipping/Creaky',
  3: 'Creaky/Heavy',
  4: 'Level vs Dipping/Creaky',
  5: 'Falling vs Creaky/Heavy',
  6: 'Mixed pairs',
  7: 'Mixed advanced',
};

type ViewMode = 'select' | 'drill' | 'summary';

export function LessonDrill() {
  const {
    session,
    drill,
    isComplete,
    summary,
    isLoading,
    error,
    startLesson,
    submitAnswer,
    resetLesson,
  } = useLessonApi();
  const { recordReview } = useProgress();

  const [themes, setThemes] = useState<ThemeInfo[]>([]);
  const [themesLoading, setThemesLoading] = useState(true);
  const [showingFeedback, setShowingFeedback] = useState(false);
  const [lastResult, setLastResult] = useState<{
    correct: boolean;
    vietnamese: string;
    correctSeq: ToneId[];
  } | null>(null);
  const [key, setKey] = useState(0);
  const attemptStartTime = useRef<number | null>(null);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load themes on mount
  useEffect(() => {
    fetchLessonThemes()
      .then(setThemes)
      .catch(console.error)
      .finally(() => setThemesLoading(false));
  }, []);

  // Reset state when drill changes
  useEffect(() => {
    if (drill) {
      attemptStartTime.current = Date.now();
      setShowingFeedback(false);
      setLastResult(null);
      setKey((k) => k + 1);
    }
  }, [drill]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (advanceTimerRef.current) {
        clearTimeout(advanceTimerRef.current);
      }
    };
  }, []);

  const handleStartLesson = useCallback(
    async (themeId?: number) => {
      await startLesson(themeId);
    },
    [startLesson]
  );

  const handleSelect = useCallback(
    async (selectedSequence: ToneId[], isCorrect: boolean) => {
      if (!drill) return;
      if (showingFeedback) return;

      const responseTimeMs = attemptStartTime.current
        ? Date.now() - attemptStartTime.current
        : undefined;
      const reviewTimestamp = Date.now();

      setLastResult({
        correct: isCorrect,
        vietnamese: drill.vietnamese,
        correctSeq: drill.correct_sequence as ToneId[],
      });
      setShowingFeedback(true);

      if (advanceTimerRef.current) {
        clearTimeout(advanceTimerRef.current);
      }

      advanceTimerRef.current = setTimeout(async () => {
        advanceTimerRef.current = null;
        try {
          await submitAnswer(selectedSequence as number[], responseTimeMs);
          void recordReview(drill.word_id, isCorrect, reviewTimestamp);
        } catch (e) {
          console.error('Failed to submit answer:', e);
        }
      }, 1500);
    },
    [drill, showingFeedback, submitAnswer, recordReview]
  );

  const getDistractorSequences = (): ToneId[][] => {
    if (!drill) return [];
    const correct = drill.correct_sequence;
    return drill.alternatives
      .filter((alt) => !sequencesEqual(alt as ToneId[], correct as ToneId[]))
      .map((alt) => alt as ToneId[]);
  };

  // Determine current view
  const getViewMode = (): ViewMode => {
    if (isComplete && summary) return 'summary';
    if (session && drill) return 'drill';
    return 'select';
  };

  const viewMode = getViewMode();

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 p-8 text-center">
        <div className="text-6xl">❌</div>
        <h2 className="text-2xl font-bold text-red-800">Error</h2>
        <p className="text-gray-600">{error.message}</p>
        <button
          onClick={resetLesson}
          className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          Try Again
        </button>
      </div>
    );
  }

  // Lesson selector view
  if (viewMode === 'select') {
    return (
      <div className="flex flex-col items-center gap-6 p-4 w-full max-w-lg mx-auto">
        <h1 className="text-2xl font-bold text-gray-800">Choose a Lesson</h1>
        <p className="text-gray-600 text-center">
          Each lesson contains 10 drills focused on specific tone pairs.
        </p>

        {themesLoading ? (
          <div className="text-gray-500 animate-pulse">Loading themes...</div>
        ) : (
          <div className="w-full space-y-3">
            {/* Adaptive lesson */}
            <button
              onClick={() => handleStartLesson()}
              disabled={isLoading}
              className="w-full p-4 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              <div className="font-semibold">Adaptive Lesson</div>
              <div className="text-sm opacity-80">
                Focus on your weakest tone pairs
              </div>
            </button>

            {/* Themed lessons */}
            <div className="grid grid-cols-2 gap-3">
              {themes.map((theme) => (
                <button
                  key={theme.id}
                  onClick={() => handleStartLesson(theme.id)}
                  disabled={isLoading}
                  className="p-3 bg-white border-2 border-gray-200 rounded-xl hover:border-indigo-400 disabled:opacity-50 transition-colors text-left"
                >
                  <div className="font-semibold text-gray-800">
                    Lesson {theme.id + 1}
                  </div>
                  <div className="text-xs text-gray-500">
                    {THEME_DESCRIPTIONS[theme.id] || `Theme ${theme.id}`}
                  </div>
                  <div className="text-xs text-indigo-600 mt-1">
                    {theme.pairs
                      .map((p) => `${TONE_NAMES[p[0] - 1]}/${TONE_NAMES[p[1] - 1]}`)
                      .join(', ')}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {isLoading && (
          <div className="text-indigo-600 animate-pulse">Starting lesson...</div>
        )}
      </div>
    );
  }

  // Summary view
  if (viewMode === 'summary' && summary) {
    return (
      <LessonSummaryView
        summary={summary}
        onChooseLesson={resetLesson}
        onNextAdaptive={() => startLesson()}
        isLoading={isLoading}
      />
    );
  }

  // Drill view
  if (!drill || !session) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 p-8 text-center">
        <div className="text-4xl animate-pulse">Loading...</div>
      </div>
    );
  }

  const correctSequence = drill.correct_sequence as ToneId[];
  const distractorSequences = getDistractorSequences();
  const progress = drill.progress;

  return (
    <div className="flex flex-col items-center gap-6 p-4 w-full max-w-lg mx-auto">
      {/* Progress bar */}
      <div className="w-full">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-gray-500">
            {progress.phase === 'learning' ? 'Learning' : 'Review'}
          </span>
          <span className="text-sm text-gray-500">
            {progress.current + 1} / {progress.total}
          </span>
        </div>
        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              progress.phase === 'review' ? 'bg-amber-500' : 'bg-indigo-600'
            }`}
            style={{
              width: `${((progress.current + 1) / progress.total) * 100}%`,
            }}
          />
        </div>
        <div className="text-xs text-gray-400 mt-1 text-center">
          {session.theme_id >= 0
            ? `Lesson ${session.theme_id + 1}: ${THEME_DESCRIPTIONS[session.theme_id]}`
            : 'Adaptive Lesson'}
        </div>
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
            {lastResult.vietnamese} ({formatToneSequenceDiacritics(lastResult.correctSeq)})
          </p>
        </div>
      )}

      {/* Audio button */}
      <div className="my-4">
        <AudioButton
          wordId={drill.word_id}
          text={drill.vietnamese}
          autoPlay={!showingFeedback}
          voice={drill.voice}
          speed={drill.speed}
        />
      </div>

      {/* English meaning */}
      <div className="text-center">
        <p className="text-lg text-gray-600">{drill.english}</p>
      </div>

      {/* Mode indicator */}
      <p className="text-gray-500 text-sm">
        {drill.mode === '2-choice-1syl' && 'Select the correct tone:'}
        {drill.mode === '4-choice-1syl' && 'Select the correct tone (4 choices):'}
        {drill.mode === '2-choice-2syl' && 'Select the correct tone sequence:'}
      </p>

      {/* Tone grid */}
      <ToneGrid
        key={key}
        correctSequence={correctSequence}
        distractorSequences={distractorSequences}
        onSelect={handleSelect}
        disabled={showingFeedback}
      />

      {/* Exit button */}
      <button
        onClick={resetLesson}
        className="text-sm text-gray-400 hover:text-gray-600 underline"
      >
        Exit Lesson
      </button>
    </div>
  );
}

// Summary component
interface LessonSummaryViewProps {
  summary: LessonSummary;
  onChooseLesson: () => void;
  onNextAdaptive: () => void;
  isLoading: boolean;
}

function LessonSummaryView({ summary, onChooseLesson, onNextAdaptive, isLoading }: LessonSummaryViewProps) {
  const accuracyColor =
    summary.accuracy >= 90
      ? 'text-green-600'
      : summary.accuracy >= 70
      ? 'text-yellow-600'
      : 'text-red-600';

  return (
    <div className="flex flex-col items-center gap-6 p-8 w-full max-w-lg mx-auto text-center">
      <div className="text-6xl">
        {summary.accuracy >= 90 ? '🎉' : summary.accuracy >= 70 ? '👍' : '💪'}
      </div>

      <h1 className="text-2xl font-bold text-gray-800">Lesson Complete!</h1>

      <div className="w-full bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="text-sm text-gray-500 mb-1">
          {summary.theme_id >= 0
            ? `Lesson ${summary.theme_id + 1}: ${THEME_DESCRIPTIONS[summary.theme_id]}`
            : 'Adaptive Lesson'}
        </div>

        <div className={`text-5xl font-bold ${accuracyColor} my-4`}>
          {Math.round(summary.accuracy)}%
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-gray-500">Total Drills</div>
            <div className="text-xl font-semibold">{summary.total_drills}</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-gray-500">Mistakes</div>
            <div className="text-xl font-semibold">{summary.mistakes_count}</div>
          </div>
        </div>

        <div className="mt-4 text-xs text-gray-400">
          Focus pairs:{' '}
          {summary.theme_pairs
            .map((p) => `${TONE_NAMES[p[0] - 1]}/${TONE_NAMES[p[1] - 1]}`)
            .join(', ')}
        </div>
      </div>

      <button
        onClick={onNextAdaptive}
        disabled={isLoading}
        className="w-full py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
      >
        {isLoading ? 'Starting...' : 'Next Adaptive Lesson'}
      </button>

      <button
        onClick={onChooseLesson}
        disabled={isLoading}
        className="text-sm text-gray-500 hover:text-gray-700 underline"
      >
        Choose Different Lesson
      </button>
    </div>
  );
}
