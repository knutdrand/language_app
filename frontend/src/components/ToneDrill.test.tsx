import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mockSpeak, mockAudioPlay } from '../test/setup';
import type { Word } from '../types';

// Test words with different tones
const testWords: Word[] = [
  { id: 1, vietnamese: 'mèo', english: 'cat', imageUrl: 'cat.jpg' },
  { id: 2, vietnamese: 'chó', english: 'dog', imageUrl: 'dog.jpg' },
  { id: 3, vietnamese: 'cá', english: 'fish', imageUrl: 'fish.jpg' },
  { id: 4, vietnamese: 'gà', english: 'chicken', imageUrl: 'chicken.jpg' },
];

// Track which word is returned
let mockWordIndex = 0;
let mockIsLoading = false;
const mockRecordReview = vi.fn();
const mockLogToneAttempt = vi.fn();
const mockRecordProgress = vi.fn();

// Mock the hooks
vi.mock('../hooks/useToneFSRS', () => ({
  useToneFSRS: vi.fn(() => ({
    getNextWord: vi.fn(() => {
      if (mockWordIndex >= testWords.length) return null;
      return { word: testWords[mockWordIndex], sequenceKey: '2' };
    }),
    recordReview: mockRecordReview,
    getDueCount: vi.fn(() => testWords.length - mockWordIndex),
    getCardForSequence: vi.fn(),
    getSequenceAccuracy: vi.fn(),
    getOverallAccuracy: vi.fn(),
    isLoading: mockIsLoading,
  })),
}));

vi.mock('../hooks/useProgress', () => ({
  useProgress: vi.fn(() => ({
    recordReview: mockRecordProgress,
    reviewsToday: 0,
    correctToday: 0,
    isLoading: false,
  })),
}));

vi.mock('../hooks/useAttemptLog', () => ({
  useAttemptLog: vi.fn(() => ({
    logToneAttempt: mockLogToneAttempt,
  })),
}));

// Import AFTER mocks are set up
import { ToneDrill } from './ToneDrill';
import { useToneFSRS } from '../hooks/useToneFSRS';
import { useProgress } from '../hooks/useProgress';

describe('ToneDrill Synchronization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSpeak.mockClear();
    mockAudioPlay.mockClear();
    mockWordIndex = 0;
    mockIsLoading = false;

    // Reset mock implementations
    vi.mocked(useToneFSRS).mockReturnValue({
      getNextWord: vi.fn(() => {
        if (mockWordIndex >= testWords.length) return null;
        return { word: testWords[mockWordIndex], sequenceKey: '2' };
      }),
      recordReview: mockRecordReview,
      getDueCount: vi.fn(() => testWords.length - mockWordIndex),
      getCardForSequence: vi.fn(),
      getSequenceAccuracy: vi.fn(),
      getOverallAccuracy: vi.fn(),
      isLoading: mockIsLoading,
    });

    vi.mocked(useProgress).mockReturnValue({
      recordReview: mockRecordProgress,
      reviewsToday: 0,
      correctToday: 0,
      isLoading: false,
      loadProgress: vi.fn(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should display the English translation for the current word', async () => {
    render(<ToneDrill words={testWords} />);

    await waitFor(() => {
      expect(screen.getByText('cat')).toBeInTheDocument();
    });
  });

  it('should have a Play Word button', async () => {
    render(<ToneDrill words={testWords} />);

    await waitFor(() => {
      expect(screen.getByText('Play Word')).toBeInTheDocument();
    });
  });

  it('should have 4 tone option buttons', async () => {
    render(<ToneDrill words={testWords} />);

    await waitFor(() => {
      expect(screen.getByText('cat')).toBeInTheDocument();
    });

    // Get all buttons excluding Play/Check
    const allButtons = screen.getAllByRole('button');
    const toneButtons = allButtons.filter(
      btn => !btn.textContent?.includes('Play') && !btn.textContent?.includes('Check')
    );

    expect(toneButtons.length).toBe(4);
  });

  it('should show cards due count', async () => {
    render(<ToneDrill words={testWords} />);

    await waitFor(() => {
      expect(screen.getByText(/cards due/)).toBeInTheDocument();
    });
  });

  it('should show "all done" when no more words', async () => {
    mockWordIndex = testWords.length;

    vi.mocked(useToneFSRS).mockReturnValue({
      getNextWord: vi.fn(() => null),
      recordReview: mockRecordReview,
      getDueCount: vi.fn(() => 0),
      getCardForSequence: vi.fn(),
      getSequenceAccuracy: vi.fn(),
      getOverallAccuracy: vi.fn(),
      isLoading: false,
    });

    render(<ToneDrill words={testWords} />);

    await waitFor(() => {
      expect(screen.getByText('All done for now!')).toBeInTheDocument();
    });
  });

  it('should disable tone buttons after selection', async () => {
    const user = userEvent.setup();

    render(<ToneDrill words={testWords} />);

    await waitFor(() => {
      expect(screen.getByText('cat')).toBeInTheDocument();
    });

    const allButtons = screen.getAllByRole('button');
    const toneButtons = allButtons.filter(
      btn => !btn.textContent?.includes('Play') && !btn.textContent?.includes('Check')
    );

    // Click one tone button
    await user.click(toneButtons[0]);

    // After clicking, buttons should be disabled
    await waitFor(() => {
      const updatedButtons = screen.getAllByRole('button').filter(
        btn => !btn.textContent?.includes('Play') && !btn.textContent?.includes('Check')
      );
      updatedButtons.forEach(btn => {
        expect(btn).toBeDisabled();
      });
    });
  });
});

describe('AudioButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSpeak.mockClear();
    mockAudioPlay.mockClear();
    mockWordIndex = 0;
    mockIsLoading = false;

    vi.mocked(useToneFSRS).mockReturnValue({
      getNextWord: vi.fn(() => {
        return { word: testWords[0], sequenceKey: '2' };
      }),
      recordReview: mockRecordReview,
      getDueCount: vi.fn(() => testWords.length),
      getCardForSequence: vi.fn(),
      getSequenceAccuracy: vi.fn(),
      getOverallAccuracy: vi.fn(),
      isLoading: false,
    });

    vi.mocked(useProgress).mockReturnValue({
      recordReview: mockRecordProgress,
      reviewsToday: 0,
      correctToday: 0,
      isLoading: false,
      loadProgress: vi.fn(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should trigger audio when Play button is clicked', async () => {
    const user = userEvent.setup();

    render(<ToneDrill words={testWords} />);

    await waitFor(() => {
      expect(screen.getByText('Play Word')).toBeInTheDocument();
    });

    // Wait a bit for initial autoplay
    await new Promise(r => setTimeout(r, 200));

    mockAudioPlay.mockClear();
    mockSpeak.mockClear();

    // Click play button
    const playButton = screen.getByText('Play Word').closest('button');
    if (playButton) {
      await user.click(playButton);
    }

    await waitFor(() => {
      // Either Audio.play or speechSynthesis.speak should be called
      expect(mockAudioPlay.mock.calls.length + mockSpeak.mock.calls.length).toBeGreaterThan(0);
    });
  });

  it('should keep English label in sync after playing audio', async () => {
    const user = userEvent.setup();

    render(<ToneDrill words={testWords} />);

    // Initial word is "cat"
    await waitFor(() => {
      expect(screen.getByText('cat')).toBeInTheDocument();
    });

    // Wait for initial autoplay
    await new Promise(r => setTimeout(r, 200));

    // Click play button
    const playButton = screen.getByText('Play Word').closest('button');
    if (playButton) {
      await user.click(playButton);
    }

    // Wait for audio to "play"
    await new Promise(r => setTimeout(r, 100));

    // English label should still be "cat" - not changed to a different word
    expect(screen.getByText('cat')).toBeInTheDocument();

    // Should still have 4 tone buttons
    const allButtons = screen.getAllByRole('button');
    const toneButtons = allButtons.filter(
      btn => !btn.textContent?.includes('Play') && !btn.textContent?.includes('Check')
    );
    expect(toneButtons.length).toBe(4);
  });
});

describe('Word Transition Synchronization', () => {
  let callCount = 0;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSpeak.mockClear();
    mockAudioPlay.mockClear();
    callCount = 0;

    // Mock that advances to next word on each getNextWord call
    vi.mocked(useToneFSRS).mockReturnValue({
      getNextWord: vi.fn(() => {
        const word = testWords[callCount % testWords.length];
        callCount++;
        return { word, sequenceKey: String(callCount) };
      }),
      recordReview: mockRecordReview,
      getDueCount: vi.fn(() => testWords.length),
      getCardForSequence: vi.fn(),
      getSequenceAccuracy: vi.fn(),
      getOverallAccuracy: vi.fn(),
      isLoading: false,
    });

    vi.mocked(useProgress).mockReturnValue({
      recordReview: mockRecordProgress,
      reviewsToday: 0,
      correctToday: 0,
      isLoading: false,
      loadProgress: vi.fn(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should show new English label after answering and advancing', async () => {
    const user = userEvent.setup();

    render(<ToneDrill words={testWords} />);

    // First word should be "cat"
    await waitFor(() => {
      expect(screen.getByText('cat')).toBeInTheDocument();
    });

    // Wait for initial autoplay
    await new Promise(r => setTimeout(r, 200));

    // Click a tone button to answer
    const allButtons = screen.getAllByRole('button');
    const toneButtons = allButtons.filter(
      btn => !btn.textContent?.includes('Play') && !btn.textContent?.includes('Check')
    );
    await user.click(toneButtons[0]);

    // Wait for feedback delay (1000ms in ToneGrid) + auto-advance delay (1500ms in ToneDrill)
    await waitFor(() => {
      // After advancing, should show the next word "dog"
      expect(screen.getByText('dog')).toBeInTheDocument();
    }, { timeout: 3000 });

    // Verify the UI is still in sync - should have 4 tone buttons again
    await waitFor(() => {
      const updatedButtons = screen.getAllByRole('button').filter(
        btn => !btn.textContent?.includes('Play') && !btn.textContent?.includes('Check')
      );
      expect(updatedButtons.length).toBe(4);
    });
  });

  it('should auto-play audio for the new word after advancing', async () => {
    const user = userEvent.setup();

    render(<ToneDrill words={testWords} />);

    // First word
    await waitFor(() => {
      expect(screen.getByText('cat')).toBeInTheDocument();
    });

    // Wait for initial autoplay
    await new Promise(r => setTimeout(r, 200));

    // Clear mocks to track new audio plays
    mockAudioPlay.mockClear();
    mockSpeak.mockClear();

    // Answer the question
    const allButtons = screen.getAllByRole('button');
    const toneButtons = allButtons.filter(
      btn => !btn.textContent?.includes('Play') && !btn.textContent?.includes('Check')
    );
    await user.click(toneButtons[0]);

    // Wait for transition to new word
    await waitFor(() => {
      expect(screen.getByText('dog')).toBeInTheDocument();
    }, { timeout: 3000 });

    // Wait for autoplay on new word
    await new Promise(r => setTimeout(r, 200));

    // Audio should have been triggered for the new word
    expect(mockAudioPlay.mock.calls.length + mockSpeak.mock.calls.length).toBeGreaterThan(0);
  });

  it('should have enabled tone buttons for the new word', async () => {
    const user = userEvent.setup();

    render(<ToneDrill words={testWords} />);

    await waitFor(() => {
      expect(screen.getByText('cat')).toBeInTheDocument();
    });

    await new Promise(r => setTimeout(r, 200));

    // Answer
    const allButtons = screen.getAllByRole('button');
    const toneButtons = allButtons.filter(
      btn => !btn.textContent?.includes('Play') && !btn.textContent?.includes('Check')
    );
    await user.click(toneButtons[0]);

    // Wait for new word
    await waitFor(() => {
      expect(screen.getByText('dog')).toBeInTheDocument();
    }, { timeout: 3000 });

    // New word's tone buttons should be enabled (not disabled)
    await waitFor(() => {
      const newToneButtons = screen.getAllByRole('button').filter(
        btn => !btn.textContent?.includes('Play') && !btn.textContent?.includes('Check')
      );
      // At least one button should be enabled for the new word
      const enabledButtons = newToneButtons.filter(btn => !btn.hasAttribute('disabled'));
      expect(enabledButtons.length).toBe(4);
    });
  });
});
