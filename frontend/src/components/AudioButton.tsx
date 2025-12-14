import { useCallback, useState, useEffect, useRef } from 'react';

interface AudioButtonProps {
  text: string;
  language?: string;
  autoPlay?: boolean;
}

export function AudioButton({ text, language = 'vi-VN', autoPlay = false }: AudioButtonProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const lastPlayedText = useRef<string | null>(null);

  const speak = useCallback(() => {
    if ('speechSynthesis' in window) {
      // Cancel any ongoing speech
      speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = language;
      utterance.rate = 0.8; // Slightly slower for learning

      utterance.onstart = () => setIsPlaying(true);
      utterance.onend = () => setIsPlaying(false);
      utterance.onerror = () => setIsPlaying(false);

      speechSynthesis.speak(utterance);
    } else {
      console.warn('Speech synthesis not supported');
    }
  }, [text, language]);

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
