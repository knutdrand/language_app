import { useState, useEffect } from 'react';
import { ToneDrill } from './components/ToneDrill';
import { SpeakDrill } from './components/SpeakDrill';
import { LessonDrill } from './components/LessonDrill';
import { useAuth } from './contexts/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { API_BASE_URL } from './config';
import { fetchWords } from './services/wordsApi';
import words from './data/words.json';
import type { Word, DrillMode } from './types';

type AuthView = 'login' | 'register';

function App() {
  const { isAuthenticated, isLoading, user, logout } = useAuth();
  const [drillMode, setDrillMode] = useState<DrillMode>('tone');
  const [authView, setAuthView] = useState<AuthView>('login');
  const [backendError, setBackendError] = useState<string | null>(null);
  const [wordsData, setWordsData] = useState<Word[]>(words as Word[]);

  // Check backend health on startup
  useEffect(() => {
    async function checkHealth() {
      try {
        const response = await fetch(`${API_BASE_URL}/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) {
          setBackendError(`Backend returned status ${response.status}`);
        } else {
          setBackendError(null);
        }
      } catch (e) {
        setBackendError(`Cannot connect to backend at ${API_BASE_URL}`);
      }
    }
    checkHealth();
  }, []);

  // Load words from API (fallback to bundled list if needed)
  useEffect(() => {
    let mounted = true;

    async function loadWords() {
      try {
        const data = await fetchWords();
        if (mounted) {
          setWordsData(data);
        }
      } catch (e) {
        // Keep bundled words as fallback when API is unavailable.
      }
    }

    loadWords();
    return () => {
      mounted = false;
    };
  }, []);

  const footerText = drillMode === 'tone'
    ? 'Listen to the word and select the correct tone sequence'
    : drillMode === 'lesson'
    ? 'Structured lessons focused on specific tone pairs'
    : 'Practice speaking Vietnamese with tone feedback';

  // Show loading spinner while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-purple-50">
        <div className="text-indigo-600">Loading...</div>
      </div>
    );
  }

  // Show error if backend is not reachable
  if (backendError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-50">
        <div className="text-center p-8">
          <div className="text-red-600 text-xl font-semibold mb-2">Backend Unavailable</div>
          <div className="text-red-500 text-sm">{backendError}</div>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
          >
            Retry
          </button>
        </div>
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
            <button
              onClick={logout}
              className="text-sm text-gray-500 hover:text-indigo-600 transition"
              title={user?.email}
            >
              Sign out
            </button>
          </div>

          {/* Mode toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setDrillMode('lesson')}
              className={`
                flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                ${drillMode === 'lesson'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }
              `}
            >
              Lessons
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
              Free Practice
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
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="py-6">
        {drillMode === 'lesson' ? (
          <LessonDrill />
        ) : drillMode === 'tone' ? (
          <ToneDrill />
        ) : (
          <SpeakDrill words={wordsData} />
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
