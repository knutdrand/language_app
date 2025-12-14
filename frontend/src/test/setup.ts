import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Create mock functions that can be accessed and cleared in tests
export const mockSpeak = vi.fn();
export const mockCancel = vi.fn();

// Mock SpeechSynthesisUtterance
class MockSpeechSynthesisUtterance {
  text: string;
  lang: string = '';
  rate: number = 1;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(text: string) {
    this.text = text;
  }
}

// @ts-expect-error - mocking global
globalThis.SpeechSynthesisUtterance = MockSpeechSynthesisUtterance;

// Mock speechSynthesis API
const mockSpeechSynthesis = {
  speak: mockSpeak,
  cancel: mockCancel,
  getVoices: () => [],
};

Object.defineProperty(window, 'speechSynthesis', {
  value: mockSpeechSynthesis,
  writable: true,
  configurable: true,
});
