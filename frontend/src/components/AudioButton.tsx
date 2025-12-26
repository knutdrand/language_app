import { useCallback, useState, useEffect, useRef } from 'react';
import { getAudioUrl } from '../config';

interface AudioButtonProps {
  wordId: number;
  text: string;
  autoPlay?: boolean;
  voice?: string;   // Voice for audio (e.g., "banmai", "leminh")
  speed?: number;   // Speed for audio (-3 to +3)
}

export function AudioButton({ wordId, text, autoPlay = false, voice, speed }: AudioButtonProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastPlayedWordId = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Play audio from backend - no fallbacks
  const speak = useCallback(async () => {
    if (isPlaying) return;

    setIsPlaying(true);
    setError(null);

    // Stop any current audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    try {
      const audioUrl = getAudioUrl(wordId, text, voice, speed);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onended = () => {
        setIsPlaying(false);
        audioRef.current = null;
      };

      audio.onerror = () => {
        const msg = `FPT audio not found for word ${wordId}: "${text}"`;
        console.error(msg);
        setError(msg);
        setIsPlaying(false);
        audioRef.current = null;
      };

      await audio.play();
    } catch (err) {
      const msg = `Failed to play FPT audio for word ${wordId}: "${text}"`;
      console.error(msg, err);
      setError(msg);
      setIsPlaying(false);
    }
  }, [wordId, text, voice, speed, isPlaying]);

  // Auto-play when wordId changes (new word loaded)
  useEffect(() => {
    if (autoPlay && wordId !== lastPlayedWordId.current) {
      lastPlayedWordId.current = wordId;
      // Small delay to ensure DOM is updated
      const timer = setTimeout(() => {
        speak();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [autoPlay, wordId, speak]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={speak}
        disabled={isPlaying}
        className={`
          flex items-center justify-center gap-3
          px-8 py-4 rounded-2xl
          text-xl font-semibold
          transition-all duration-200
          ${isPlaying
            ? 'bg-indigo-400 cursor-not-allowed'
            : error
              ? 'bg-red-600 hover:bg-red-700'
              : 'bg-indigo-600 hover:bg-indigo-700 hover:scale-105 active:scale-95'
          }
          text-white shadow-lg
        `}
      >
        <span className="text-3xl">{error ? '❌' : isPlaying ? '🔊' : '🔈'}</span>
        <span>{error ? 'Audio Missing' : 'Play Word'}</span>
      </button>
      {error && (
        <p className="text-red-500 text-sm max-w-xs text-center">{error}</p>
      )}
    </div>
  );
}
