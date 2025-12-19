import React, { useMemo, useState } from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import {
  type ToneId,
  formatToneSymbols,
  sequencesEqual,
  shuffleArray,
} from '../utils/tones';

interface ToneOption {
  id: number;
  sequence: ToneId[];
}

interface ToneGridProps {
  correctSequence: ToneId[];
  distractorSequences: ToneId[][];
  onSelect: (selectedSequence: ToneId[], isCorrect: boolean) => void;
  disabled?: boolean;
}

export function ToneGrid({
  correctSequence,
  distractorSequences,
  onSelect,
  disabled = false,
}: ToneGridProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);

  const options: ToneOption[] = useMemo(() => {
    // Support 1 distractor (2-choice) or 3 distractors (4-choice)
    const numDistractors = distractorSequences.length >= 3 ? 3 : distractorSequences.length;
    const allOptions = [
      { id: 0, sequence: correctSequence },
      ...distractorSequences.slice(0, numDistractors).map((seq, i) => ({ id: i + 1, sequence: seq })),
    ];
    return shuffleArray(allOptions);
  }, [correctSequence, distractorSequences]);

  const isTwoChoice = options.length === 2;

  const handleSelect = (option: ToneOption) => {
    if (disabled || showResult) return;

    setSelectedId(option.id);
    setShowResult(true);

    const isCorrect = sequencesEqual(option.sequence, correctSequence);

    // Delay callback to show feedback
    setTimeout(() => {
      onSelect(option.sequence, isCorrect);
    }, 1000);
  };

  const getButtonStyle = (option: ToneOption) => {
    if (!showResult) {
      return styles.optionDefault;
    }

    const isCorrectOption = sequencesEqual(option.sequence, correctSequence);

    if (isCorrectOption) {
      return styles.optionCorrect;
    }

    if (option.id === selectedId && !isCorrectOption) {
      return styles.optionIncorrect;
    }

    return styles.optionFaded;
  };

  return (
    <View style={styles.grid}>
      {options.map((option) => {
        const isCorrectOption = sequencesEqual(option.sequence, correctSequence);
        return (
          <TouchableOpacity
            key={option.id}
            onPress={() => handleSelect(option)}
            disabled={disabled || showResult}
            style={[
              styles.option,
              isTwoChoice && styles.optionLarge,
              getButtonStyle(option),
            ]}
            activeOpacity={0.8}
          >
            <Text style={styles.symbols}>
              {formatToneSymbols(option.sequence)}
            </Text>

            {/* Result overlay */}
            {showResult && isCorrectOption && (
              <View style={[styles.overlay, styles.overlayCorrect]}>
                <Text style={styles.overlayText}>✓</Text>
              </View>
            )}
            {showResult && option.id === selectedId && !isCorrectOption && (
              <View style={[styles.overlay, styles.overlayIncorrect]}>
                <Text style={styles.overlayText}>✗</Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 16,
    width: '100%',
    maxWidth: 400,
  },
  option: {
    width: '45%',
    minHeight: 120,
    borderRadius: 16,
    borderWidth: 4,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  optionLarge: {
    width: '45%',
    minHeight: 160,
    padding: 24,
  },
  optionDefault: {
    borderColor: '#E5E7EB',
  },
  optionCorrect: {
    borderColor: '#22C55E',
    backgroundColor: '#F0FDF4',
  },
  optionIncorrect: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  optionFaded: {
    borderColor: '#E5E7EB',
    opacity: 0.5,
  },
  symbols: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#4F46E5',
    letterSpacing: 8,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayCorrect: {
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
  },
  overlayIncorrect: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  overlayText: {
    fontSize: 48,
  },
});
