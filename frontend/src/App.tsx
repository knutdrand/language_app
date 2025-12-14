import { Drill } from './components/Drill';
import words from './data/words.json';
import type { Word } from './types';

function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-indigo-900">
            Vietnamese Vocab
          </h1>
          <span className="text-sm text-gray-500">
            {words.length} words
          </span>
        </div>
      </header>

      {/* Main content */}
      <main className="py-6">
        <Drill words={words as Word[]} />
      </main>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur border-t border-gray-200">
        <div className="max-w-lg mx-auto px-4 py-3 text-center text-xs text-gray-400">
          Listen to the word and select the matching image
        </div>
      </footer>
    </div>
  );
}

export default App;
