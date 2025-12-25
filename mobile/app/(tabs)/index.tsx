import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AudioButton } from '../../components/AudioButton';
import { ToneGrid } from '../../components/ToneGrid';
import {
  useDrillApi,
  type PreviousAnswer,
  type DifficultyLevel,
} from '../../hooks/useDrillApi';
import {
  type ToneId,
  formatToneSequence,
  formatToneSequenceDiacritics,
  sequencesEqual,
} from '../../utils/tones';

export default function ToneDrillScreen() {
  const {
    drill,
    difficultyLevel,
    isLoading,
    error,
    submitAnswer,
    reload,
  } = useDrillApi('tone');

  const [showingFeedback, setShowingFeedback] = useState(false);
  const [lastResult, setLastResult] = useState<{
    correct: boolean;
    vietnamese: string;
    correctSeq: ToneId[];
  } | null>(null);
  const [key, setKey] = useState(0);
  const attemptStartTime = useRef<number | null>(null);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Session stats (local only)
  const [sessionReviews, setSessionReviews] = useState(0);
  const [sessionCorrect, setSessionCorrect] = useState(0);

  // Reset attempt timer when drill changes
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

  const handleSelect = useCallback(
    async (selectedSequence: ToneId[], isCorrect: boolean) => {
      if (!drill) return;
      if (showingFeedback) return;

      const responseTimeMs = attemptStartTime.current
        ? Date.now() - attemptStartTime.current
        : undefined;

      // Update session stats
      setSessionReviews((r) => r + 1);
      if (isCorrect) {
        setSessionCorrect((c) => c + 1);
      }

      setLastResult({
        correct: isCorrect,
        vietnamese: drill.vietnamese,
        correctSeq: drill.correct_sequence as ToneId[],
      });
      setShowingFeedback(true);

      // Clear any existing timer
      if (advanceTimerRef.current) {
        clearTimeout(advanceTimerRef.current);
      }

      // Submit answer and get next drill after delay
      advanceTimerRef.current = setTimeout(async () => {
        advanceTimerRef.current = null;

        const answer: PreviousAnswer = {
          problem_type_id: drill.problem_type_id,
          word_id: drill.word_id,
          vietnamese: drill.vietnamese,
          correct_sequence: drill.correct_sequence,
          selected_sequence: selectedSequence as number[],
          alternatives: drill.alternatives,
          response_time_ms: responseTimeMs,
          voice: drill.voice,
          speed: drill.speed,
        };

        try {
          await submitAnswer(answer);
        } catch (e) {
          console.error('Failed to submit answer:', e);
        }
      }, 1500);
    },
    [drill, showingFeedback, submitAnswer]
  );

  // Extract distractors from alternatives
  const getDistractorSequences = (): ToneId[][] => {
    if (!drill) return [];
    const correct = drill.correct_sequence;
    return drill.alternatives
      .filter((alt) => !sequencesEqual(alt as ToneId[], correct as ToneId[]))
      .map((alt) => alt as ToneId[]);
  };

  const accuracy = sessionReviews > 0
    ? Math.round((sessionCorrect / sessionReviews) * 100)
    : 0;

  const formatDifficultyLevel = (level: DifficultyLevel): string => {
    switch (level) {
      case '2-choice': return '2-choice (1-syl)';
      case 'mixed': return 'Mixed';
      case '4-choice-multi': return '4-choice (2-syl)';
      default: return level;
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.errorEmoji}>❌</Text>
          <Text style={styles.errorTitle}>Error</Text>
          <Text style={styles.errorSubtitle}>{error.message}</Text>
          <Text style={styles.errorHint}>Please make sure you are logged in.</Text>
          <TouchableOpacity style={styles.retryButton} onPress={reload}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!drill) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.doneEmoji}>🎉</Text>
          <Text style={styles.doneTitle}>All done for now!</Text>
          <Text style={styles.doneSubtitle}>
            You've reviewed all due tones. Come back later for more practice.
          </Text>
          {sessionReviews > 0 && (
            <View style={styles.statsBox}>
              <Text style={styles.statsLabel}>Session stats</Text>
              <Text style={styles.statsValue}>
                {sessionReviews} reviews • {accuracy}% accuracy
              </Text>
            </View>
          )}
          <TouchableOpacity style={styles.checkMoreButton} onPress={reload}>
            <Text style={styles.checkMoreButtonText}>Check for more</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const correctSequence = drill.correct_sequence as ToneId[];
  const distractorSequences = getDistractorSequences();

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Progress bar */}
        <View style={styles.progressRow}>
          <Text style={styles.progressText}>
            Mode: {formatDifficultyLevel(difficultyLevel)}
          </Text>
          <Text style={styles.progressText}>
            {sessionReviews} reviewed • {accuracy}%
          </Text>
        </View>

        {/* Feedback banner */}
        {lastResult && (
          <View style={[
            styles.feedbackBanner,
            lastResult.correct ? styles.feedbackCorrect : styles.feedbackIncorrect,
          ]}>
            <Text style={[
              styles.feedbackTitle,
              lastResult.correct ? styles.feedbackTextCorrect : styles.feedbackTextIncorrect,
            ]}>
              {lastResult.correct
                ? '✓ Correct!'
                : `✗ The tones were: ${formatToneSequence(lastResult.correctSeq)}`}
            </Text>
            <Text style={[
              styles.feedbackSubtitle,
              lastResult.correct ? styles.feedbackTextCorrect : styles.feedbackTextIncorrect,
            ]}>
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
        {drill.english && (
          <Text style={styles.englishText}>{drill.english}</Text>
        )}

        {/* Instruction */}
        <Text style={styles.instruction}>Select the correct tone sequence:</Text>

        {/* Tone grid */}
        <ToneGrid
          key={key}
          correctSequence={correctSequence}
          distractorSequences={distractorSequences}
          onSelect={handleSelect}
          disabled={showingFeedback}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  scrollContent: {
    padding: 16,
    alignItems: 'center',
    gap: 16,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 16,
  },
  loadingText: {
    fontSize: 24,
    color: '#6B7280',
  },
  errorEmoji: {
    fontSize: 64,
    marginBottom: 8,
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
  errorHint: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: '#6366F1',
    borderRadius: 12,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 8,
  },
  progressText: {
    fontSize: 14,
    color: '#6B7280',
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
    marginBottom: 8,
  },
  doneEmoji: {
    fontSize: 64,
    marginBottom: 8,
  },
  doneTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
  },
  doneSubtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  statsBox: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    alignItems: 'center',
  },
  statsLabel: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  statsValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginTop: 4,
  },
  checkMoreButton: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: '#6366F1',
    borderRadius: 12,
  },
  checkMoreButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
