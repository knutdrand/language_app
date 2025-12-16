import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Word } from '../../types';
import { AudioButton } from '../../components/AudioButton';
import { ToneGrid } from '../../components/ToneGrid';
import { useToneFSRS } from '../../hooks/useToneFSRS';
import { useProgress, initializeProgress } from '../../stores/progressStore';
import { useAttemptLog } from '../../hooks/useAttemptLog';
import {
  type ToneId,
  getToneSequence,
  getDistractorSequences,
  formatToneSequence,
  formatToneSequenceDiacritics,
} from '../../utils/tones';

// Import words data
import wordsData from '../../data/words.json';
const words: Word[] = wordsData as Word[];

export default function ToneDrillScreen() {
  // Initialize progress store
  useEffect(() => {
    initializeProgress();
  }, []);

  const { getNextWord, recordReview, getDueCount, isLoading } = useToneFSRS(words);
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
  } | null>(null);
  const [key, setKey] = useState(0);
  const attemptStartTime = useRef<number | null>(null);
  const hasLoadedInitial = useRef(false);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      attemptStartTime.current = Date.now();
    } else {
      setCurrentWord(null);
      setCurrentSequenceKey(null);
    }
  }, [getNextWord]);

  // Load first word when loading completes
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
      if (showingFeedback) return;

      const responseTimeMs = attemptStartTime.current
        ? Date.now() - attemptStartTime.current
        : undefined;

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

      setLastResult({ correct: isCorrect, word: currentWord, correctSeq: correctSequence });
      setShowingFeedback(true);

      recordReview(currentSequenceKey, isCorrect);
      recordProgress(isCorrect);

      if (advanceTimerRef.current) {
        clearTimeout(advanceTimerRef.current);
      }

      advanceTimerRef.current = setTimeout(() => {
        advanceTimerRef.current = null;
        loadNextWord();
      }, 1500);
    },
    [currentWord, currentSequenceKey, correctSequence, distractorSequences, showingFeedback, recordReview, recordProgress, loadNextWord, logToneAttempt]
  );

  const dueCount = useMemo(() => getDueCount(), [getDueCount, key]);
  const accuracy = reviewsToday > 0 ? Math.round((correctToday / reviewsToday) * 100) : 0;

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!currentWord) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.celebrationEmoji}>🎉</Text>
          <Text style={styles.doneTitle}>All done for now!</Text>
          <Text style={styles.doneSubtitle}>
            You've reviewed all due tones. Come back later for more practice.
          </Text>
          <View style={styles.statsCard}>
            <Text style={styles.statsLabel}>Today's stats (Tone Mode)</Text>
            <Text style={styles.statsValue}>
              {reviewsToday} reviews • {accuracy}% accuracy
            </Text>
          </View>
          <TouchableOpacity style={styles.checkButton} onPress={loadNextWord}>
            <Text style={styles.checkButtonText}>Check for more</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Progress bar */}
        <View style={styles.progressRow}>
          <Text style={styles.progressText}>{dueCount} cards due</Text>
          <Text style={styles.progressText}>
            {reviewsToday} reviewed • {accuracy}% accuracy
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
              {lastResult.word.vietnamese} ({formatToneSequenceDiacritics(lastResult.correctSeq)})
            </Text>
          </View>
        )}

        {/* Audio button */}
        <View style={styles.audioSection}>
          <AudioButton
            wordId={currentWord.id}
            text={currentWord.vietnamese}
            autoPlay={!showingFeedback}
          />
        </View>

        {/* English meaning */}
        <Text style={styles.englishMeaning}>{currentWord.english}</Text>

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
  celebrationEmoji: {
    fontSize: 64,
  },
  doneTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
    textAlign: 'center',
  },
  doneSubtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
  },
  statsCard: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    alignItems: 'center',
  },
  statsLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  statsValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginTop: 4,
  },
  checkButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#4F46E5',
    borderRadius: 12,
  },
  checkButtonText: {
    color: '#fff',
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
  englishMeaning: {
    fontSize: 18,
    color: '#6B7280',
    textAlign: 'center',
  },
  instruction: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 8,
  },
});
