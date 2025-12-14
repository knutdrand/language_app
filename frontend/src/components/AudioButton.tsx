import { useCallback, useState, useEffect, useRef } from 'react';
import { getAudioUrl } from '../config';

interface AudioButtonProps {
  text: string;
  language?: string;
  autoPlay?: boolean;
}

export function AudioButton({ text, language = 'vi', autoPlay = false }: AudioButtonProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const lastPlayedText = useRef<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Fallback to browser speech synthesis
  const speakWithBrowser = useCallback(() => {
    if ('speechSynthesis' in window) {
      speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = language === 'vi' ? 'vi-VN' : language;
      utterance.rate = 0.8;

      utterance.onstart = () => setIsPlaying(true);
      utterance.onend = () => setIsPlaying(false);
      utterance.onerror = () => setIsPlaying(false);

      speechSynthesis.speak(utterance);
    } else {
      console.warn('Speech synthesis not supported');
      setIsPlaying(false);
    }
  }, [text, language]);

  // Play audio from backend, fallback to browser TTS
  const speak = useCallback(async () => {
    if (isPlaying) return;

    setIsPlaying(true);

    // Stop any current audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    speechSynthesis.cancel();

    try {
      const audioUrl = getAudioUrl(text, language);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onended = () => {
        setIsPlaying(false);
        audioRef.current = null;
      };

      audio.onerror = () => {
        console.log('Backend audio not available, falling back to browser TTS');
        speakWithBrowser();
        audioRef.current = null;
      };

      await audio.play();
    } catch (error) {
      console.log('Failed to play backend audio, falling back to browser TTS');
      speakWithBrowser();
    }
  }, [text, language, isPlaying, speakWithBrowser]);

  // Auto-play when text changes (new word loaded)
  useEffect(() => {
    if (autoPlay && text !== lastPlayedText.current) {
      lastPlayedText.current = text;
      const timer = setTimeout(() => {
        speak();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [autoPlay, text, speak]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      speechSynthesis.cancel();
    };
  }, []);

  return (
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
          : 'bg-indigo-600 hover:bg-indigo-700 hover:scale-105 active:scale-95'
        }
        text-white shadow-lg
      `}
    >
      <span className="text-3xl">{isPlaying ? '🔊' : '🔈'}</span>
      <span>Play Word</span>
    </button>
  );
}
