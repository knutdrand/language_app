import { useState, useEffect, useRef, useCallback } from 'react';
import { Audio } from 'expo-av';
import { Platform } from 'react-native';
import { getAudioUrl, AUDIO_SOURCE } from '../config';
import { getEmbeddedAudio } from '../data/audioAssets';

interface UseAudioOptions {
  autoPlay?: boolean;
  voice?: string;   // Voice for audio (e.g., "banmai", "leminh")
  speed?: number;   // Speed for audio (-3 to +3)
}

/**
 * Cross-platform audio playback hook.
 * Supports embedded audio (bundled in app) and remote audio (from backend).
 * No fallbacks - throws error if FPT audio is not available.
 */
export function useAudio(wordId: number | null, text: string, options: UseAudioOptions = {}) {
  const { autoPlay = false, voice, speed } = options;
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
      const audioUrl = getAudioUrl(wordId, text, 'vi', voice, speed);
      success = await playRemote(audioUrl);
    }

    // No fallbacks - error if audio not available
    if (!success) {
      setIsLoading(false);
      console.error(`FPT audio not found for word ${wordId}: "${text}". No fallbacks available.`);
    }
  }, [wordId, text, voice, speed, isPlaying, cleanup, playEmbedded, playRemote]);

  // Stop playback
  const stop = useCallback(async () => {
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
    };
  }, [cleanup]);

  return {
    play,
    stop,
    isPlaying,
    isLoading,
  };
}
