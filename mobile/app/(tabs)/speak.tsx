import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';

import type { Word } from '../../types';
import { AudioButton } from '../../components/AudioButton';
import { API_BASE_URL } from '../../config';
import {
  getToneSequence,
  formatToneSequenceDiacritics,
  type ToneId,
} from '../../utils/tones';

// Import words data
import wordsData from '../../data/words.json';
const words: Word[] = wordsData as Word[];

// Tone names for display
const TONE_NAMES: Record<ToneId, string> = {
  1: 'ngang',
  2: 'huyền',
  3: 'sắc',
  4: 'hỏi',
  5: 'ngã',
  6: 'nặng',
};

interface ToneCheckResult {
  is_correct: boolean;
  text_match: boolean;
  tone_match: boolean;
  transcription: string;
  expected: string;
  transcribed_tones: number[];
  expected_tones: number[];
  positions: Array<{
    position: number;
    expected_tone: number;
    transcribed_tone: number;
    match: boolean;
  }>;
}

export default function SpeakScreen() {
  const [currentWord, setCurrentWord] = useState<Word | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<ToneCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permissionGranted, setPermissionGranted] = useState(false);

  const recordingRef = useRef<Audio.Recording | null>(null);

  // Request microphone permission
  useEffect(() => {
    async function requestPermission() {
      try {
        const { granted } = await Audio.requestPermissionsAsync();
        setPermissionGranted(granted);
        if (granted) {
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: true,
            playsInSilentModeIOS: true,
          });
        }
      } catch (e) {
        console.error('Failed to request audio permission:', e);
      }
    }
    requestPermission();
  }, []);

  // Load a random word
  const loadNewWord = useCallback(() => {
    // Filter to single-syllable words for now (easier to start)
    const singleSyllableWords = words.filter(
      (w) => !w.vietnamese.includes(' ')
    );
    const randomIndex = Math.floor(Math.random() * singleSyllableWords.length);
    setCurrentWord(singleSyllableWords[randomIndex]);
    setResult(null);
    setError(null);
  }, []);

  // Load first word on mount
  useEffect(() => {
    loadNewWord();
  }, [loadNewWord]);

  // Start recording
  const startRecording = async () => {
    if (!permissionGranted) {
      setError('Microphone permission not granted');
      return;
    }

    try {
      setError(null);
      setResult(null);

      // Configure recording for WAV format at 16kHz (required by wav2vec2)
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync({
        android: {
          extension: '.wav',
          outputFormat: Audio.AndroidOutputFormat.DEFAULT,
          audioEncoder: Audio.AndroidAudioEncoder.DEFAULT,
          sampleRate: 16000,
          numberOfChannels: 1,
          bitRate: 256000,
        },
        ios: {
          extension: '.wav',
          audioQuality: Audio.IOSAudioQuality.HIGH,
          sampleRate: 16000,
          numberOfChannels: 1,
          bitRate: 256000,
          linearPCMBitDepth: 16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat: false,
        },
        web: {
          mimeType: 'audio/wav',
          bitsPerSecond: 256000,
        },
      });

      await recording.startAsync();
      recordingRef.current = recording;
      setIsRecording(true);
    } catch (e) {
      console.error('Failed to start recording:', e);
      setError('Failed to start recording');
    }
  };

  // Stop recording and send to API
  const stopRecording = async () => {
    if (!recordingRef.current) return;

    try {
      setIsRecording(false);
      setIsProcessing(true);

      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      if (!uri || !currentWord) {
        setError('No recording available');
        setIsProcessing(false);
        return;
      }

      // Send to API
      const formData = new FormData();

      // Read file and append
      if (Platform.OS === 'web') {
        const response = await fetch(uri);
        const blob = await response.blob();
        formData.append('audio', blob, 'recording.wav');
      } else {
        formData.append('audio', {
          uri,
          type: 'audio/wav',
          name: 'recording.wav',
        } as unknown as Blob);
      }

      formData.append('expected', currentWord.vietnamese);
      formData.append('strict', 'false');

      const apiResponse = await fetch(`${API_BASE_URL}/api/asr/check-tone`, {
        method: 'POST',
        body: formData,
      });

      if (!apiResponse.ok) {
        const errorText = await apiResponse.text();
        throw new Error(`API error: ${errorText}`);
      }

      const checkResult: ToneCheckResult = await apiResponse.json();
      setResult(checkResult);
    } catch (e) {
      console.error('Failed to process recording:', e);
      setError(e instanceof Error ? e.message : 'Failed to process recording');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!currentWord) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }

  const toneSequence = getToneSequence(currentWord.vietnamese);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Word to pronounce */}
        <View style={styles.wordSection}>
          <Text style={styles.label}>Say this word:</Text>
          <Text style={styles.word}>{currentWord.vietnamese}</Text>
          <Text style={styles.english}>{currentWord.english}</Text>
          <Text style={styles.toneHint}>
            Tones: {formatToneSequenceDiacritics(toneSequence)}
          </Text>

          {/* Play reference audio */}
          <View style={styles.audioButton}>
            <AudioButton wordId={currentWord.id} text={currentWord.vietnamese} />
          </View>
        </View>

        {/* Recording button */}
        <View style={styles.recordSection}>
          {!permissionGranted ? (
            <Text style={styles.errorText}>
              Microphone permission required
            </Text>
          ) : isProcessing ? (
            <View style={styles.processingContainer}>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={styles.processingText}>Checking pronunciation...</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[
                styles.recordButton,
                isRecording && styles.recordButtonActive,
              ]}
              onPressIn={startRecording}
              onPressOut={stopRecording}
              activeOpacity={0.8}
            >
              <Text style={styles.recordButtonText}>
                {isRecording ? '🎙️ Recording...' : '🎤 Hold to Record'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Result feedback */}
        {result && (
          <View
            style={[
              styles.resultSection,
              result.tone_match ? styles.resultSuccess : styles.resultError,
            ]}
          >
            <Text style={styles.resultTitle}>
              {result.tone_match ? '✓ Correct Tones!' : '✗ Try Again'}
            </Text>

            <Text style={styles.resultText}>
              You said: "{result.transcription}"
            </Text>

            <View style={styles.toneComparison}>
              {result.positions.map((pos, idx) => (
                <View key={idx} style={styles.tonePosition}>
                  <Text
                    style={[
                      styles.toneResult,
                      pos.match ? styles.toneMatch : styles.toneMismatch,
                    ]}
                  >
                    {pos.match ? '✓' : '✗'}{' '}
                    {TONE_NAMES[pos.expected_tone as ToneId]}
                    {!pos.match &&
                      ` (said ${TONE_NAMES[pos.transcribed_tone as ToneId]})`}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Error display */}
        {error && (
          <View style={styles.errorSection}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Next word button */}
        <TouchableOpacity style={styles.nextButton} onPress={loadNewWord}>
          <Text style={styles.nextButtonText}>Next Word →</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
  },
  wordSection: {
    alignItems: 'center',
    marginBottom: 30,
  },
  label: {
    fontSize: 16,
    color: '#666',
    marginBottom: 10,
  },
  word: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  english: {
    fontSize: 20,
    color: '#666',
    marginBottom: 8,
  },
  toneHint: {
    fontSize: 16,
    color: '#888',
    marginBottom: 16,
  },
  audioButton: {
    marginTop: 10,
  },
  recordSection: {
    marginVertical: 30,
    alignItems: 'center',
  },
  recordButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 20,
    paddingHorizontal: 40,
    borderRadius: 50,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  recordButtonActive: {
    backgroundColor: '#FF3B30',
    transform: [{ scale: 1.1 }],
  },
  recordButtonText: {
    color: 'white',
    fontSize: 20,
    fontWeight: '600',
  },
  processingContainer: {
    alignItems: 'center',
  },
  processingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  resultSection: {
    padding: 20,
    borderRadius: 12,
    marginVertical: 20,
    width: '100%',
    alignItems: 'center',
  },
  resultSuccess: {
    backgroundColor: '#d4edda',
    borderColor: '#28a745',
    borderWidth: 1,
  },
  resultError: {
    backgroundColor: '#f8d7da',
    borderColor: '#dc3545',
    borderWidth: 1,
  },
  resultTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  resultText: {
    fontSize: 16,
    color: '#333',
    marginBottom: 10,
  },
  toneComparison: {
    marginTop: 10,
  },
  tonePosition: {
    marginVertical: 4,
  },
  toneResult: {
    fontSize: 16,
  },
  toneMatch: {
    color: '#28a745',
  },
  toneMismatch: {
    color: '#dc3545',
  },
  errorSection: {
    padding: 15,
    backgroundColor: '#fff3cd',
    borderRadius: 8,
    marginVertical: 10,
  },
  errorText: {
    color: '#856404',
    fontSize: 14,
  },
  nextButton: {
    marginTop: 20,
    padding: 15,
    backgroundColor: '#28a745',
    borderRadius: 8,
  },
  nextButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
});
