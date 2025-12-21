import { useState, useMemo } from 'react';
import { Drill } from './components/Drill';
import { ToneDrill } from './components/ToneDrill';
import { SpeakDrill } from './components/SpeakDrill';
import { VowelDrill } from './components/VowelDrill';
import { SourceSelector } from './components/SourceSelector';
import { useAuth } from './contexts/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import words from './data/words.json';
import sources from './data/sources.json';
import type { Word, Source, DrillMode } from './types';

type AuthView = 'login' | 'register';

function App() {
  const { isAuthenticated, isLoading, user, logout } = useAuth();
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [drillMode, setDrillMode] = useState<DrillMode>('image');
  const [authView, setAuthView] = useState<AuthView>('login');

  // Filter words by selected source
  const filteredWords = useMemo(() => {
    if (selectedSourceId === null) {
      return words as Word[];
    }
    return (words as Word[]).filter(w => w.sourceId === selectedSourceId);
  }, [selectedSourceId]);

  const footerText = drillMode === 'image'
    ? 'Listen to the word and select the matching image'
    : drillMode === 'tone'
    ? 'Listen to the word and select the correct tone sequence'
    : drillMode === 'speak'
    ? 'Practice speaking Vietnamese with tone feedback'
    : 'Listen to the word and select the correct vowel sound';

  // Show loading spinner while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-purple-50">
        <div className="text-indigo-600">Loading...</div>
      </div>
    );
  }

  // Show login/register if not authenticated
  if (!isAuthenticated) {
    if (authView === 'login') {
      return <LoginPage onSwitchToRegister={() => setAuthView('register')} />;
    }
    return <RegisterPage onSwitchToLogin={() => setAuthView('login')} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-lg mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-bold text-indigo-900">
              Vietnamese Vocab
            </h1>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">
                {filteredWords.length} words
              </span>
              <button
                onClick={logout}
                className="text-sm text-gray-500 hover:text-indigo-600 transition"
                title={user?.email}
              >
                Sign out
              </button>
            </div>
          </div>

          {/* Mode toggle */}
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setDrillMode('image')}
              className={`
                flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                ${drillMode === 'image'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }
              `}
            >
              Image
            </button>
            <button
              onClick={() => setDrillMode('tone')}
              className={`
                flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                ${drillMode === 'tone'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }
              `}
            >
              Tone
            </button>
            <button
              onClick={() => setDrillMode('speak')}
              className={`
                flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                ${drillMode === 'speak'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }
              `}
            >
              Speak
            </button>
            <button
              onClick={() => setDrillMode('vowel')}
              className={`
                flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                ${drillMode === 'vowel'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }
              `}
            >
              Vowel
            </button>
          </div>

          <SourceSelector
            sources={sources as Source[]}
            selectedSourceId={selectedSourceId}
            onSelectSource={setSelectedSourceId}
          />
        </div>
      </header>

      {/* Main content */}
      <main className="py-6">
        {drillMode === 'image' ? (
          <Drill
            key={`image-${selectedSourceId || 'all'}`}
            words={filteredWords}
            sources={sources as Source[]}
          />
        ) : drillMode === 'tone' ? (
          <ToneDrill
            key={`tone-${selectedSourceId || 'all'}`}
            sources={sources as Source[]}
          />
        ) : drillMode === 'speak' ? (
          <SpeakDrill
            key={`speak-${selectedSourceId || 'all'}`}
            words={filteredWords}
          />
        ) : (
          <VowelDrill
            key={`vowel-${selectedSourceId || 'all'}`}
            sources={sources as Source[]}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur border-t border-gray-200">
        <div className="max-w-lg mx-auto px-4 py-3 text-center text-xs text-gray-400">
          {footerText}
        </div>
      </footer>
    </div>
  );
}

export default App;
