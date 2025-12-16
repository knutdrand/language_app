import { useState, useEffect, useRef, useCallback } from 'react';
import { Audio } from 'expo-av';
import { Platform } from 'react-native';
import { getAudioUrl, AUDIO_SOURCE } from '../config';
import { getEmbeddedAudio } from '../data/audioAssets';

interface UseAudioOptions {
  autoPlay?: boolean;
}

/**
 * Cross-platform audio playback hook.
 * Supports embedded audio (bundled in app) and remote audio (from backend).
 * Falls back to speech synthesis on web if audio fails.
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

  // Play audio from embedded asset
  const playEmbedded = useCallback(async (asset: any): Promise<boolean> => {
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });

      const { sound } = await Audio.Sound.createAsync(asset, { shouldPlay: true });

      soundRef.current = sound;
      setIsLoading(false);
      setIsPlaying(true);

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setIsPlaying(false);
        }
      });

      return true;
    } catch (error) {
      console.error('Failed to play embedded audio:', error);
      return false;
    }
  }, []);

  // Play audio from remote URL
  const playRemote = useCallback(async (audioUrl: string): Promise<boolean> => {
    try {
      if (Platform.OS === 'web') {
        // Web: Use HTML5 Audio
        return new Promise((resolve) => {
          const audio = new window.Audio(audioUrl);
          audio.onloadeddata = () => setIsLoading(false);
          audio.onplay = () => setIsPlaying(true);
          audio.onended = () => {
            setIsPlaying(false);
            resolve(true);
          };
          audio.onerror = () => {
            setIsLoading(false);
            setIsPlaying(false);
            resolve(false);
          };
          audio.play().catch(() => resolve(false));
        });
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

        return true;
      }
    } catch (error) {
      console.error('Failed to play remote audio:', error);
      return false;
    }
  }, []);

  // Fallback to speech synthesis (web only)
  const playSpeechSynthesis = useCallback((textToSpeak: string) => {
    if (Platform.OS === 'web' && 'speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.lang = 'vi-VN';
      utterance.rate = 0.8;
      utterance.onstart = () => setIsPlaying(true);
      utterance.onend = () => setIsPlaying(false);
      window.speechSynthesis.speak(utterance);
    }
  }, []);

  // Main play function
  const play = useCallback(async () => {
    if (!wordId || !text || isPlaying) return;

    setIsLoading(true);
    await cleanup();

    let success = false;

    // Try embedded audio first if configured
    if (AUDIO_SOURCE === 'embedded') {
      const embeddedAsset = getEmbeddedAudio(wordId);
      if (embeddedAsset) {
        success = await playEmbedded(embeddedAsset);
      }
    }

    // Fall back to remote if embedded not available or failed
    if (!success) {
      const audioUrl = getAudioUrl(wordId, text, 'vi');
      success = await playRemote(audioUrl);
    }

    // Final fallback to speech synthesis on web
    if (!success) {
      setIsLoading(false);
      playSpeechSynthesis(text);
    }
  }, [wordId, text, isPlaying, cleanup, playEmbedded, playRemote, playSpeechSynthesis]);

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
