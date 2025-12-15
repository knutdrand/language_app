import type { Source } from '../types';

interface SourceSelectorProps {
  sources: Source[];
  selectedSourceId: string | null;
  onSelectSource: (sourceId: string | null) => void;
}

export function SourceSelector({ sources, selectedSourceId, onSelectSource }: SourceSelectorProps) {
  return (
    <div className="w-full">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onSelectSource(null)}
          className={`
            px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
            ${selectedSourceId === null
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }
          `}
        >
          All Words
        </button>
        {sources.map((source) => (
          <button
            key={source.id}
            onClick={() => onSelectSource(source.id)}
            className={`
              px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
              ${selectedSourceId === source.id
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }
            `}
            title={source.description}
          >
            {source.title.length > 25 ? source.title.slice(0, 25) + '...' : source.title}
            <span className="ml-1 text-xs opacity-70">({source.wordCount})</span>
          </button>
        ))}
      </div>
    </div>
  );
}
