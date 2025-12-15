import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { AudioButton } from './AudioButton';
import { mockSpeak, mockCancel, mockAudioPlay } from '../test/setup';

beforeEach(() => {
  mockSpeak.mockClear();
  mockCancel.mockClear();
  mockAudioPlay.mockClear();
});

describe('AudioButton', () => {
  it('renders play button', () => {
    render(<AudioButton wordId={1} text="xin chào" />);
    expect(screen.getByText('Play Word')).toBeInTheDocument();
  });

  it('should not auto-play when autoPlay is false', async () => {
    render(<AudioButton wordId={1} text="xin chào" autoPlay={false} />);

    // Wait a bit for any potential autoPlay to trigger
    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });

    expect(mockSpeak).not.toHaveBeenCalled();
    expect(mockAudioPlay).not.toHaveBeenCalled();
  });

  it('should auto-play when autoPlay is true', async () => {
    render(<AudioButton wordId={1} text="xin chào" autoPlay={true} />);

    // Wait for autoPlay timeout and fallback
    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });

    // Should have tried Audio first
    expect(mockAudioPlay).toHaveBeenCalled();

    // Should have fallen back to speechSynthesis
    expect(mockSpeak).toHaveBeenCalled();
  });

  it('should auto-play again when text changes', async () => {
    const { rerender } = render(<AudioButton wordId={1} text="xin chào" autoPlay={true} />);

    // Wait for initial autoPlay
    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });

    expect(mockSpeak).toHaveBeenCalledTimes(1);
    mockSpeak.mockClear();
    mockAudioPlay.mockClear();

    // Change to a new word
    rerender(<AudioButton wordId={2} text="con mèo" autoPlay={true} />);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });

    // Should have played again for new text
    expect(mockSpeak).toHaveBeenCalledTimes(1);
  });

  it('should not replay on re-render with same text', async () => {
    const { rerender } = render(<AudioButton wordId={1} text="xin chào" autoPlay={true} />);

    // Wait for initial autoPlay
    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });

    expect(mockSpeak).toHaveBeenCalledTimes(1);
    mockSpeak.mockClear();

    // Re-render with same text
    rerender(<AudioButton wordId={1} text="xin chào" autoPlay={true} />);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });

    // Should NOT have played again (same text)
    expect(mockSpeak).not.toHaveBeenCalled();
  });
});
