import { useMemo, useState } from 'react';
import type { Word } from '../types';

interface ImageGridProps {
  correctWord: Word;
  distractors: Word[];
  onSelect: (selectedWord: Word, isCorrect: boolean) => void;
  disabled?: boolean;
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function ImageGrid({ correctWord, distractors, onSelect, disabled = false }: ImageGridProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);

  const options = useMemo(() => {
    return shuffleArray([correctWord, ...distractors.slice(0, 3)]);
  }, [correctWord, distractors]);

  const handleSelect = (word: Word) => {
    if (disabled || showResult) return;

    setSelectedId(word.id);
    setShowResult(true);

    const isCorrect = word.id === correctWord.id;

    // Delay callback to show feedback
    setTimeout(() => {
      onSelect(word, isCorrect);
    }, 1000);
  };

  const getButtonStyle = (word: Word) => {
    if (!showResult) {
      return 'border-gray-200 hover:border-indigo-400 hover:shadow-lg';
    }

    if (word.id === correctWord.id) {
      return 'border-green-500 bg-green-50 ring-4 ring-green-200';
    }

    if (word.id === selectedId && word.id !== correctWord.id) {
      return 'border-red-500 bg-red-50 ring-4 ring-red-200';
    }

    return 'border-gray-200 opacity-50';
  };

  return (
    <div className="grid grid-cols-2 gap-4 w-full max-w-lg">
      {options.map((word) => (
        <button
          key={word.id}
          onClick={() => handleSelect(word)}
          disabled={disabled || showResult}
          className={`
            relative aspect-square rounded-xl overflow-hidden
            border-4 transition-all duration-200
            ${getButtonStyle(word)}
            ${!disabled && !showResult ? 'cursor-pointer active:scale-95' : 'cursor-default'}
          `}
        >
          <img
            src={word.imageUrl}
            alt={word.english}
            className="w-full h-full object-cover"
            loading="lazy"
          />
          {showResult && word.id === correctWord.id && (
            <div className="absolute inset-0 flex items-center justify-center bg-green-500/20">
              <span className="text-5xl">✓</span>
            </div>
          )}
          {showResult && word.id === selectedId && word.id !== correctWord.id && (
            <div className="absolute inset-0 flex items-center justify-center bg-red-500/20">
              <span className="text-5xl">✗</span>
            </div>
          )}
        </button>
      ))}
    </div>
  );
}
