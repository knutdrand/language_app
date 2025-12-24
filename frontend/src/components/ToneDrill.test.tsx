import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mockSpeak, mockAudioPlay } from '../test/setup';

// Mock drill data
const mockDrill = {
  problem_type_id: 'tone_1',
  word_id: 1,
  vietnamese: 'mèo',
  english: 'cat',
  correct_sequence: [2],
  alternatives: [[2], [3]],
};

const mockPairStats = [
  { pair: [1, 2] as [number, number], alpha: 5, beta: 5, mean: 0.5 },
  { pair: [1, 3] as [number, number], alpha: 5, beta: 5, mean: 0.5 },
  { pair: [1, 4] as [number, number], alpha: 5, beta: 5, mean: 0.5 },
  { pair: [1, 5] as [number, number], alpha: 5, beta: 5, mean: 0.5 },
  { pair: [1, 6] as [number, number], alpha: 5, beta: 5, mean: 0.5 },
  { pair: [2, 3] as [number, number], alpha: 5, beta: 5, mean: 0.5 },
  { pair: [2, 4] as [number, number], alpha: 5, beta: 5, mean: 0.5 },
  { pair: [2, 5] as [number, number], alpha: 5, beta: 5, mean: 0.5 },
  { pair: [2, 6] as [number, number], alpha: 5, beta: 5, mean: 0.5 },
  { pair: [3, 4] as [number, number], alpha: 5, beta: 5, mean: 0.5 },
  { pair: [3, 5] as [number, number], alpha: 5, beta: 5, mean: 0.5 },
  { pair: [3, 6] as [number, number], alpha: 5, beta: 5, mean: 0.5 },
  { pair: [4, 5] as [number, number], alpha: 5, beta: 5, mean: 0.5 },
  { pair: [4, 6] as [number, number], alpha: 5, beta: 5, mean: 0.5 },
  { pair: [5, 6] as [number, number], alpha: 5, beta: 5, mean: 0.5 },
];

const mockLegacyPairProbabilities = mockPairStats.map((s) => ({
  pair: [s.pair[0] - 1, s.pair[1] - 1] as [number, number],
  probability: s.mean,
  correct: s.alpha,
  total: s.alpha + s.beta,
}));

// Track mocked responses
const mockSubmitAnswer = vi.fn();
const mockGetPairProbability = vi.fn().mockReturnValue(0.5);

function createMockReturn(overrides = {}) {
  return {
    drill: mockDrill,
    pairStats: mockPairStats,
    fourChoiceStats: [],
    legacyPairProbabilities: mockLegacyPairProbabilities,
    difficultyLevel: '2-choice' as const,
    isLoading: false,
    error: null,
    submitAnswer: mockSubmitAnswer,
    reload: vi.fn(),
    getPairProbability: mockGetPairProbability,
    ...overrides,
  };
}

// Mock the hook
vi.mock('../hooks/useDrillApi', () => ({
  useDrillApi: vi.fn(() => createMockReturn()),
}));

// Import AFTER mocks are set up
import { ToneDrill } from './ToneDrill';
import { useDrillApi } from '../hooks/useDrillApi';

describe('ToneDrill Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSpeak.mockClear();
    mockAudioPlay.mockClear();
    mockSubmitAnswer.mockResolvedValue({
      drill: mockDrill,
      difficulty_level: '2-choice',
      pair_stats: mockPairStats,
      four_choice_stats: [],
      state_updates: [],
    });

    vi.mocked(useDrillApi).mockReturnValue(createMockReturn());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should display the English translation for the current word', async () => {
    render(<ToneDrill />);

    await waitFor(() => {
      expect(screen.getByText('cat')).toBeInTheDocument();
    });
  });

  it('should have a Play Word button', async () => {
    render(<ToneDrill />);

    await waitFor(() => {
      expect(screen.getByText('Play Word')).toBeInTheDocument();
    });
  });

  it('should have 2 tone option buttons in 2-choice mode', async () => {
    render(<ToneDrill />);

    await waitFor(() => {
      expect(screen.getByText('cat')).toBeInTheDocument();
    });

    // Get all buttons excluding Play/Check/Stats
    const allButtons = screen.getAllByRole('button');
    const toneButtons = allButtons.filter(
      btn => !btn.textContent?.includes('Play') &&
             !btn.textContent?.includes('Check') &&
             !btn.textContent?.includes('Stats') &&
             !btn.textContent?.includes('Hide')
    );

    expect(toneButtons.length).toBe(2);
  });

  it('should show mode indicator', async () => {
    render(<ToneDrill />);

    await waitFor(() => {
      expect(screen.getByText(/Mode: 2-choice/)).toBeInTheDocument();
    });
  });

  it('should show error state when there is an error', async () => {
    vi.mocked(useDrillApi).mockReturnValue(createMockReturn({
      drill: null,
      error: new Error('Authentication required'),
    }));

    render(<ToneDrill />);

    await waitFor(() => {
      expect(screen.getByText('Error')).toBeInTheDocument();
      expect(screen.getByText('Authentication required')).toBeInTheDocument();
    });
  });

  it('should show loading state', async () => {
    vi.mocked(useDrillApi).mockReturnValue(createMockReturn({
      drill: null,
      isLoading: true,
    }));

    render(<ToneDrill />);

    await waitFor(() => {
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });
  });

  it('should disable tone buttons after selection', async () => {
    const user = userEvent.setup();

    render(<ToneDrill />);

    await waitFor(() => {
      expect(screen.getByText('cat')).toBeInTheDocument();
    });

    const allButtons = screen.getAllByRole('button');
    const toneButtons = allButtons.filter(
      btn => !btn.textContent?.includes('Play') &&
             !btn.textContent?.includes('Check') &&
             !btn.textContent?.includes('Stats') &&
             !btn.textContent?.includes('Hide')
    );

    // Click one tone button
    await user.click(toneButtons[0]);

    // After clicking, buttons should be disabled
    await waitFor(() => {
      const updatedButtons = screen.getAllByRole('button').filter(
        btn => !btn.textContent?.includes('Play') &&
               !btn.textContent?.includes('Check') &&
               !btn.textContent?.includes('Stats') &&
               !btn.textContent?.includes('Hide')
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

    vi.mocked(useDrillApi).mockReturnValue(createMockReturn());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should trigger audio when Play button is clicked', async () => {
    const user = userEvent.setup();

    render(<ToneDrill />);

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

    render(<ToneDrill />);

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

    // Should still have 2 tone buttons (2-choice mode)
    const allButtons = screen.getAllByRole('button');
    const toneButtons = allButtons.filter(
      btn => !btn.textContent?.includes('Play') &&
             !btn.textContent?.includes('Check') &&
             !btn.textContent?.includes('Stats') &&
             !btn.textContent?.includes('Hide')
    );
    expect(toneButtons.length).toBe(2);
  });
});

describe('Answer Submission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSpeak.mockClear();
    mockAudioPlay.mockClear();

    const nextDrill = {
      problem_type_id: 'tone_1',
      word_id: 2,
      vietnamese: 'chó',
      english: 'dog',
      correct_sequence: [3],
      alternatives: [[2], [3]],
    };

    mockSubmitAnswer.mockResolvedValue({
      drill: nextDrill,
      difficulty_level: '2-choice' as const,
      pair_stats: mockPairStats,
      four_choice_stats: [],
      state_updates: [],
    });

    vi.mocked(useDrillApi).mockReturnValue(createMockReturn());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should call submitAnswer when a tone is selected', async () => {
    const user = userEvent.setup();

    render(<ToneDrill />);

    await waitFor(() => {
      expect(screen.getByText('cat')).toBeInTheDocument();
    });

    const allButtons = screen.getAllByRole('button');
    const toneButtons = allButtons.filter(
      btn => !btn.textContent?.includes('Play') &&
             !btn.textContent?.includes('Check') &&
             !btn.textContent?.includes('Stats') &&
             !btn.textContent?.includes('Hide')
    );

    // Click a tone button
    await user.click(toneButtons[0]);

    // Wait for ToneGrid's 1000ms delay + ToneDrill's 1500ms delay
    await waitFor(() => {
      expect(mockSubmitAnswer).toHaveBeenCalledWith(
        expect.objectContaining({
          word_id: 1,
          correct_sequence: [2],
        })
      );
    }, { timeout: 3500 });
  });
});
