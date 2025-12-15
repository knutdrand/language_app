import { useMemo, useState } from 'react';
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
    const allOptions = [
      { id: 0, sequence: correctSequence },
      ...distractorSequences.slice(0, 3).map((seq, i) => ({ id: i + 1, sequence: seq })),
    ];
    return shuffleArray(allOptions);
  }, [correctSequence, distractorSequences]);

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
      return 'border-gray-200 hover:border-indigo-400 hover:shadow-lg bg-white';
    }

    const isCorrectOption = sequencesEqual(option.sequence, correctSequence);

    if (isCorrectOption) {
      return 'border-green-500 bg-green-50 ring-4 ring-green-200';
    }

    if (option.id === selectedId && !isCorrectOption) {
      return 'border-red-500 bg-red-50 ring-4 ring-red-200';
    }

    return 'border-gray-200 opacity-50 bg-white';
  };

  return (
    <div className="grid grid-cols-2 gap-4 w-full max-w-lg">
      {options.map((option) => {
        const isCorrectOption = sequencesEqual(option.sequence, correctSequence);
        return (
          <button
            key={option.id}
            onClick={() => handleSelect(option)}
            disabled={disabled || showResult}
            className={`
              relative rounded-xl overflow-hidden
              border-4 transition-all duration-200
              p-4 min-h-[120px] flex flex-col items-center justify-center
              ${getButtonStyle(option)}
              ${!disabled && !showResult ? 'cursor-pointer active:scale-95' : 'cursor-default'}
            `}
          >
            {/* Tone symbols only */}
            <div className="text-3xl font-bold text-indigo-600 tracking-widest">
              {formatToneSymbols(option.sequence)}
            </div>

            {/* Success/failure overlay */}
            {showResult && isCorrectOption && (
              <div className="absolute inset-0 flex items-center justify-center bg-green-500/20">
                <span className="text-5xl">✓</span>
              </div>
            )}
            {showResult && option.id === selectedId && !isCorrectOption && (
              <div className="absolute inset-0 flex items-center justify-center bg-red-500/20">
                <span className="text-5xl">✗</span>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
