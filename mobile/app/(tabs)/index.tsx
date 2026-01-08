import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AudioButton } from '../../components/AudioButton';
import { ToneGrid } from '../../components/ToneGrid';
import {
  useLessonApi,
  fetchLessonThemes,
  type ThemeInfo,
  type LessonSummary,
} from '../../hooks/useLessonApi';
import {
  type ToneId,
  formatToneSequence,
  formatToneSequenceDiacritics,
  sequencesEqual,
} from '../../utils/tones';

// Tone names for display
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

export default function LessonDrillScreen() {
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
        } catch (e) {
          console.error('Failed to submit answer:', e);
        }
      }, 1500);
    },
    [drill, showingFeedback, submitAnswer]
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
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.errorEmoji}>❌</Text>
          <Text style={styles.errorTitle}>Error</Text>
          <Text style={styles.errorSubtitle}>{error.message}</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={resetLesson}>
            <Text style={styles.primaryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Lesson selector view
  if (viewMode === 'select') {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.selectContent}>
          <Text style={styles.title}>Choose a Lesson</Text>
          <Text style={styles.subtitle}>
            Each lesson contains 10 drills focused on specific tone pairs.
          </Text>

          {themesLoading ? (
            <ActivityIndicator size="large" color="#6366F1" />
          ) : (
            <View style={styles.themeList}>
              {/* Adaptive lesson */}
              <TouchableOpacity
                onPress={() => handleStartLesson()}
                disabled={isLoading}
                style={[styles.adaptiveButton, isLoading && styles.buttonDisabled]}
              >
                <Text style={styles.adaptiveButtonTitle}>Adaptive Lesson</Text>
                <Text style={styles.adaptiveButtonSubtitle}>
                  Focus on your weakest tone pairs
                </Text>
              </TouchableOpacity>

              {/* Themed lessons */}
              <View style={styles.themeGrid}>
                {themes.map((theme) => (
                  <TouchableOpacity
                    key={theme.id}
                    onPress={() => handleStartLesson(theme.id)}
                    disabled={isLoading}
                    style={[styles.themeButton, isLoading && styles.buttonDisabled]}
                  >
                    <Text style={styles.themeButtonTitle}>
                      Lesson {theme.id + 1}
                    </Text>
                    <Text style={styles.themeButtonDesc}>
                      {THEME_DESCRIPTIONS[theme.id] || `Theme ${theme.id}`}
                    </Text>
                    <Text style={styles.themeButtonPairs}>
                      {theme.pairs
                        .map((p) => `${TONE_NAMES[p[0] - 1]}/${TONE_NAMES[p[1] - 1]}`)
                        .join(', ')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {isLoading && (
            <Text style={styles.loadingText}>Starting lesson...</Text>
          )}
        </ScrollView>
      </SafeAreaView>
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
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#6366F1" />
        </View>
      </SafeAreaView>
    );
  }

  const correctSequence = drill.correct_sequence as ToneId[];
  const distractorSequences = getDistractorSequences();
  const progress = drill.progress;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.drillContent}>
        {/* Progress bar */}
        <View style={styles.progressContainer}>
          <View style={styles.progressRow}>
            <Text style={styles.progressText}>
              {progress.phase === 'learning' ? 'Learning' : 'Review'}
            </Text>
            <Text style={styles.progressText}>
              {progress.current + 1} / {progress.total}
            </Text>
          </View>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${((progress.current + 1) / progress.total) * 100}%`,
                  backgroundColor: progress.phase === 'review' ? '#F59E0B' : '#6366F1',
                },
              ]}
            />
          </View>
          <Text style={styles.lessonLabel}>
            {session.theme_id >= 0
              ? `Lesson ${session.theme_id + 1}: ${THEME_DESCRIPTIONS[session.theme_id]}`
              : 'Adaptive Lesson'}
          </Text>
        </View>

        {/* Feedback banner */}
        {lastResult && (
          <View
            style={[
              styles.feedbackBanner,
              lastResult.correct ? styles.feedbackCorrect : styles.feedbackIncorrect,
            ]}
          >
            <Text
              style={[
                styles.feedbackTitle,
                lastResult.correct ? styles.feedbackTextCorrect : styles.feedbackTextIncorrect,
              ]}
            >
              {lastResult.correct
                ? '✓ Correct!'
                : `✗ The tones were: ${formatToneSequence(lastResult.correctSeq)}`}
            </Text>
            <Text
              style={[
                styles.feedbackSubtitle,
                lastResult.correct ? styles.feedbackTextCorrect : styles.feedbackTextIncorrect,
              ]}
            >
              {lastResult.vietnamese} ({formatToneSequenceDiacritics(lastResult.correctSeq)})
            </Text>
          </View>
        )}

        {/* Audio button */}
        <View style={styles.audioSection}>
          <AudioButton
            wordId={drill.word_id}
            text={drill.vietnamese}
            autoPlay={!showingFeedback}
            voice={drill.voice}
            speed={drill.speed}
          />
        </View>

        {/* English meaning */}
        <Text style={styles.englishText}>{drill.english}</Text>

        {/* Mode indicator */}
        <Text style={styles.instruction}>
          {drill.mode === '2-choice-1syl' && 'Select the correct tone:'}
          {drill.mode === '4-choice-1syl' && 'Select the correct tone (4 choices):'}
          {drill.mode === '2-choice-2syl' && 'Select the correct tone sequence:'}
        </Text>

        {/* Tone grid */}
        <ToneGrid
          key={key}
          correctSequence={correctSequence}
          distractorSequences={distractorSequences}
          onSelect={handleSelect}
          disabled={showingFeedback}
        />

        {/* Exit button */}
        <TouchableOpacity onPress={resetLesson} style={styles.exitButton}>
          <Text style={styles.exitButtonText}>Exit Lesson</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// Summary component
interface LessonSummaryViewProps {
  summary: LessonSummary;
  onChooseLesson: () => void;
  onNextAdaptive: () => void;
  isLoading: boolean;
}

function LessonSummaryView({
  summary,
  onChooseLesson,
  onNextAdaptive,
  isLoading,
}: LessonSummaryViewProps) {
  const accuracyColor =
    summary.accuracy >= 90
      ? '#16A34A'
      : summary.accuracy >= 70
      ? '#CA8A04'
      : '#DC2626';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.summaryContent}>
        <Text style={styles.summaryEmoji}>
          {summary.accuracy >= 90 ? '🎉' : summary.accuracy >= 70 ? '👍' : '💪'}
        </Text>

        <Text style={styles.summaryTitle}>Lesson Complete!</Text>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>
            {summary.theme_id >= 0
              ? `Lesson ${summary.theme_id + 1}: ${THEME_DESCRIPTIONS[summary.theme_id]}`
              : 'Adaptive Lesson'}
          </Text>

          <Text style={[styles.summaryAccuracy, { color: accuracyColor }]}>
            {Math.round(summary.accuracy)}%
          </Text>

          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Total Drills</Text>
              <Text style={styles.statValue}>{summary.total_drills}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Mistakes</Text>
              <Text style={styles.statValue}>{summary.mistakes_count}</Text>
            </View>
          </View>

          <Text style={styles.pairsText}>
            Focus pairs:{' '}
            {summary.theme_pairs
              .map((p) => `${TONE_NAMES[p[0] - 1]}/${TONE_NAMES[p[1] - 1]}`)
              .join(', ')}
          </Text>
        </View>

        <TouchableOpacity
          onPress={onNextAdaptive}
          disabled={isLoading}
          style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
        >
          <Text style={styles.primaryButtonText}>
            {isLoading ? 'Starting...' : 'Next Adaptive Lesson'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onChooseLesson}
          disabled={isLoading}
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryButtonText}>Choose Different Lesson</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 16,
  },
  selectContent: {
    padding: 16,
    alignItems: 'center',
    gap: 16,
  },
  drillContent: {
    padding: 16,
    alignItems: 'center',
    gap: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
    marginTop: 16,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 8,
  },
  themeList: {
    width: '100%',
    gap: 12,
  },
  adaptiveButton: {
    width: '100%',
    padding: 16,
    backgroundColor: '#6366F1',
    borderRadius: 16,
    alignItems: 'center',
  },
  adaptiveButtonTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  adaptiveButtonSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  themeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  themeButton: {
    width: '47%',
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  themeButtonTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  themeButtonDesc: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  themeButtonPairs: {
    fontSize: 11,
    color: '#6366F1',
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  loadingText: {
    fontSize: 16,
    color: '#6366F1',
  },
  progressContainer: {
    width: '100%',
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  progressText: {
    fontSize: 14,
    color: '#6B7280',
  },
  progressBar: {
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  lessonLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 4,
  },
  feedbackBanner: {
    width: '100%',
    padding: 12,
    borderRadius: 16,
    alignItems: 'center',
  },
  feedbackCorrect: {
    backgroundColor: '#DCFCE7',
  },
  feedbackIncorrect: {
    backgroundColor: '#FEE2E2',
  },
  feedbackTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  feedbackSubtitle: {
    fontSize: 14,
    marginTop: 4,
    opacity: 0.8,
  },
  feedbackTextCorrect: {
    color: '#166534',
  },
  feedbackTextIncorrect: {
    color: '#991B1B',
  },
  audioSection: {
    marginVertical: 16,
  },
  englishText: {
    fontSize: 18,
    color: '#6B7280',
    textAlign: 'center',
  },
  instruction: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  exitButton: {
    marginTop: 16,
  },
  exitButtonText: {
    fontSize: 14,
    color: '#9CA3AF',
    textDecorationLine: 'underline',
  },
  errorEmoji: {
    fontSize: 64,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#991B1B',
  },
  errorSubtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
  },
  primaryButton: {
    width: '100%',
    paddingVertical: 16,
    backgroundColor: '#6366F1',
    borderRadius: 16,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  secondaryButton: {
    marginTop: 8,
  },
  secondaryButtonText: {
    fontSize: 14,
    color: '#6B7280',
    textDecorationLine: 'underline',
  },
  summaryContent: {
    flex: 1,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  summaryEmoji: {
    fontSize: 64,
  },
  summaryTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
  },
  summaryCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  summaryAccuracy: {
    fontSize: 48,
    fontWeight: '700',
    marginVertical: 16,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1F2937',
    marginTop: 4,
  },
  pairsText: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
  },
});
