import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AudioButton } from './AudioButton';
import { mockSpeak, mockCancel } from '../test/setup';

beforeEach(() => {
  mockSpeak.mockClear();
  mockCancel.mockClear();
});

describe('AudioButton', () => {
  it('renders play button', () => {
    render(<AudioButton text="xin chào" />);
    expect(screen.getByText('Play Word')).toBeInTheDocument();
  });

  it('should only call speak once when autoPlay is true, even after re-renders', async () => {
    vi.useFakeTimers();

    const { rerender } = render(<AudioButton text="xin chào" autoPlay={true} />);

    // Wait for initial autoPlay timeout
    await vi.advanceTimersByTimeAsync(150);

    const initialCallCount = mockSpeak.mock.calls.length;
    expect(initialCallCount).toBe(1);

    // Re-render the component (simulating parent state change)
    rerender(<AudioButton text="xin chào" autoPlay={true} />);
    await vi.advanceTimersByTimeAsync(150);

    // Re-render again
    rerender(<AudioButton text="xin chào" autoPlay={true} />);
    await vi.advanceTimersByTimeAsync(150);

    // Should still only have been called once total
    expect(mockSpeak).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('should not auto-play when autoPlay is false', async () => {
    vi.useFakeTimers();

    render(<AudioButton text="xin chào" autoPlay={false} />);

    await vi.advanceTimersByTimeAsync(200);

    expect(mockSpeak).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('should auto-play again when text changes (new word loaded)', async () => {
    vi.useFakeTimers();

    const { rerender } = render(<AudioButton text="xin chào" autoPlay={true} />);

    // Wait for initial autoPlay
    await vi.advanceTimersByTimeAsync(150);
    expect(mockSpeak).toHaveBeenCalledTimes(1);

    // Change to a new word - should play again
    rerender(<AudioButton text="con mèo" autoPlay={true} />);
    await vi.advanceTimersByTimeAsync(150);

    expect(mockSpeak).toHaveBeenCalledTimes(2);

    // Change to another word - should play again
    rerender(<AudioButton text="con chó" autoPlay={true} />);
    await vi.advanceTimersByTimeAsync(150);

    expect(mockSpeak).toHaveBeenCalledTimes(3);

    vi.useRealTimers();
  });
});
