import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { AudioButton } from './AudioButton';
import { API_BASE_URL } from '../config';
import {
  getToneSequence,
  formatToneSequenceDiacritics,
  getToneById,
  type ToneId,
} from '../utils/tones';
import type { Word } from '../types';

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

interface SpeakDrillProps {
  words: Word[];
}

export function SpeakDrill({ words }: SpeakDrillProps) {
  const [currentWord, setCurrentWord] = useState<Word | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<ToneCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Filter to single-syllable words (memoized to prevent re-renders)
  const singleSyllableWords = useMemo(
    () => words.filter((w) => !w.vietnamese.includes(' ')),
    [words]
  );

  // Load a random word
  const loadNewWord = useCallback(() => {
    if (singleSyllableWords.length === 0) return;
    const randomIndex = Math.floor(Math.random() * singleSyllableWords.length);
    setCurrentWord(singleSyllableWords[randomIndex]);
    setResult(null);
    setError(null);
  }, [singleSyllableWords]);

  // Load first word on mount
  useEffect(() => {
    loadNewWord();
  }, [loadNewWord]);

  // Spacebar to record
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        e.stopImmediatePropagation();
        // Blur any focused button to prevent it from being activated
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        if (!isRecording && !isProcessing && permissionGranted) {
          startRecording();
        }
        return false;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (isRecording) {
          stopRecording();
        }
        return false;
      }
    };

    document.addEventListener('keydown', handleKeyDown, { capture: true });
    document.addEventListener('keyup', handleKeyUp, { capture: true });

    return () => {
      document.removeEventListener('keydown', handleKeyDown, { capture: true });
      document.removeEventListener('keyup', handleKeyUp, { capture: true });
    };
  }, [isRecording, isProcessing, permissionGranted]);

  // Request microphone permission
  useEffect(() => {
    async function checkPermission() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
        setPermissionGranted(true);
      } catch {
        setPermissionGranted(false);
      }
    }
    checkPermission();
  }, []);

  // Start recording
  const startRecording = async () => {
    if (!permissionGranted) {
      setError('Microphone permission not granted');
      return;
    }

    try {
      setError(null);
      setResult(null);
      chunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
        },
      });

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        await processRecording();
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
    } catch (e) {
      console.error('Failed to start recording:', e);
      setError('Failed to start recording');
    }
  };

  // Stop recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // Process the recording
  const processRecording = async () => {
    if (!currentWord || chunksRef.current.length === 0) {
      setError('No recording available');
      return;
    }

    setIsProcessing(true);

    try {
      const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');
      formData.append('expected', currentWord.vietnamese);
      formData.append('strict', 'false');

      const response = await fetch(`${API_BASE_URL}/api/asr/check-tone`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error: ${errorText}`);
      }

      const checkResult: ToneCheckResult = await response.json();
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
      <div className="max-w-lg mx-auto px-4 py-8 text-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  const toneSequence = getToneSequence(currentWord.vietnamese);

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      {/* Word to pronounce */}
      <div className="text-center mb-8">
        <p className="text-gray-500 mb-2">Say this word:</p>
        <p className="text-5xl font-bold text-gray-900 mb-2">{currentWord.vietnamese}</p>
        <p className="text-xl text-gray-600 mb-2">{currentWord.english}</p>
        <p className="text-gray-500">
          Tones: {formatToneSequenceDiacritics(toneSequence)}
        </p>

        {/* Play reference audio */}
        <div className="mt-4">
          <AudioButton wordId={currentWord.id} text={currentWord.vietnamese} />
        </div>
      </div>

      {/* Recording section */}
      <div className="flex flex-col items-center mb-8">
        {permissionGranted === false ? (
          <p className="text-amber-600 bg-amber-50 px-4 py-2 rounded-lg">
            Microphone permission required
          </p>
        ) : isProcessing ? (
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-2" />
            <p className="text-gray-600">Checking pronunciation...</p>
          </div>
        ) : (
          <button
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onMouseLeave={stopRecording}
            onTouchStart={startRecording}
            onTouchEnd={stopRecording}
            className={`
              px-8 py-5 rounded-full text-xl font-semibold
              transition-all duration-200 shadow-lg
              ${isRecording
                ? 'bg-red-500 scale-110 text-white'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white hover:scale-105'
              }
            `}
          >
            {isRecording ? '🎙️ Recording...' : '🎤 Hold to Record (or Space)'}
          </button>
        )}
      </div>

      {/* Result feedback */}
      {result && (
        <div
          className={`
            p-6 rounded-xl mb-6 text-center
            ${result.tone_match
              ? 'bg-green-100 border border-green-300'
              : 'bg-red-100 border border-red-300'
            }
          `}
        >
          <p className="text-2xl font-bold mb-2">
            {result.tone_match ? '✓ Correct Tones!' : '✗ Try Again'}
          </p>

          <p className="text-gray-700 mb-4">
            You said: "{result.transcription}"
          </p>

          <div className="space-y-2">
            {result.positions.map((pos, idx) => (
              <p
                key={idx}
                className={pos.match ? 'text-green-700' : 'text-red-700'}
              >
                {pos.match ? '✓' : '✗'}{' '}
                {getToneById(pos.expected_tone as ToneId).vietnamese}
                {!pos.match && (
                  <span>
                    {' '}(said {getToneById(pos.transcribed_tone as ToneId).vietnamese})
                  </span>
                )}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="bg-amber-100 border border-amber-300 rounded-lg p-4 mb-6 text-center">
          <p className="text-amber-800">{error}</p>
        </div>
      )}

      {/* Next word button */}
      <div className="text-center">
        <button
          onClick={loadNewWord}
          className="px-6 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition"
        >
          Next Word →
        </button>
      </div>
    </div>
  );
}
