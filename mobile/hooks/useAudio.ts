import { useState, useEffect, useRef, useCallback } from 'react';
import { Audio } from 'expo-av';
import { Platform } from 'react-native';
import { getAudioUrl } from '../config';

interface UseAudioOptions {
  autoPlay?: boolean;
}

/**
 * Cross-platform audio playback hook.
 * Uses expo-av for native and falls back to HTML5 Audio for web.
 */
export function useAudio(wordId: number | null, text: string, options: UseAudioOptions = {}) {
  const { autoPlay = false } = options;
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);
  const lastPlayedWordId = useRef<number | null>(null);

  // Cleanup sound on unmount or when word changes
  const cleanup = useCallback(async () => {
    if (soundRef.current) {
      try {
        await soundRef.current.unloadAsync();
      } catch (e) {
        // Ignore cleanup errors
      }
      soundRef.current = null;
    }
  }, []);

  // Play audio
  const play = useCallback(async () => {
    if (!wordId || !text || isPlaying) return;

    setIsLoading(true);
    await cleanup();

    try {
      const audioUrl = getAudioUrl(wordId, text, 'vi');

      if (Platform.OS === 'web') {
        // Web: Use HTML5 Audio
        const audio = new window.Audio(audioUrl);
        audio.onloadeddata = () => setIsLoading(false);
        audio.onplay = () => setIsPlaying(true);
        audio.onended = () => setIsPlaying(false);
        audio.onerror = () => {
          setIsLoading(false);
          setIsPlaying(false);
          // Fallback to speech synthesis on web
          if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'vi-VN';
            utterance.rate = 0.8;
            utterance.onstart = () => setIsPlaying(true);
            utterance.onend = () => setIsPlaying(false);
            window.speechSynthesis.speak(utterance);
          }
        };
        await audio.play();
      } else {
        // Native: Use expo-av
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
        });

        const { sound } = await Audio.Sound.createAsync(
          { uri: audioUrl },
          { shouldPlay: true }
        );

        soundRef.current = sound;
        setIsLoading(false);
        setIsPlaying(true);

        sound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded && status.didJustFinish) {
            setIsPlaying(false);
          }
        });
      }
    } catch (error) {
      console.error('Failed to play audio:', error);
      setIsLoading(false);
      setIsPlaying(false);
    }
  }, [wordId, text, isPlaying, cleanup]);

  // Stop playback
  const stop = useCallback(async () => {
    if (Platform.OS === 'web') {
      window.speechSynthesis?.cancel();
    }
    await cleanup();
    setIsPlaying(false);
  }, [cleanup]);

  // Auto-play when word changes
  useEffect(() => {
    if (autoPlay && wordId && wordId !== lastPlayedWordId.current) {
      lastPlayedWordId.current = wordId;
      const timer = setTimeout(() => {
        play();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [autoPlay, wordId, play]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
      if (Platform.OS === 'web') {
        window.speechSynthesis?.cancel();
      }
    };
  }, [cleanup]);

  return {
    play,
    stop,
    isPlaying,
    isLoading,
  };
}
