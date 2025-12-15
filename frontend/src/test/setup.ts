import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Create mock functions that can be accessed and cleared in tests
export const mockSpeak = vi.fn();
export const mockCancel = vi.fn();
export const mockAudioPlay = vi.fn();

// Track utterances for triggering callbacks (exported for potential test access)
export let lastUtterance: MockSpeechSynthesisUtterance | null = null;

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
    lastUtterance = this;
  }
}

// @ts-expect-error - mocking global
globalThis.SpeechSynthesisUtterance = MockSpeechSynthesisUtterance;

// Mock speechSynthesis API - triggers onstart immediately, onend after short delay
const mockSpeechSynthesis = {
  speak: (utterance: MockSpeechSynthesisUtterance) => {
    mockSpeak(utterance);
    // Simulate speech: trigger onstart, then onend after delay
    if (utterance.onstart) utterance.onstart();
    setTimeout(() => {
      if (utterance.onend) utterance.onend();
    }, 10);
  },
  cancel: mockCancel,
  getVoices: () => [],
};

Object.defineProperty(window, 'speechSynthesis', {
  value: mockSpeechSynthesis,
  writable: true,
  configurable: true,
});

// Mock Audio - simulates failed backend audio (triggers fallback to speechSynthesis)
class MockAudio {
  src: string = '';
  onended: (() => void) | null = null;
  onerror: ((e: Error) => void) | null = null;

  constructor(src?: string) {
    if (src) this.src = src;
  }

  play(): Promise<void> {
    mockAudioPlay();
    // Simulate error to trigger fallback to speechSynthesis
    return Promise.reject(new Error('Mock: No backend audio'));
  }

  pause(): void {}
}

// @ts-expect-error - mocking global
globalThis.Audio = MockAudio;

// Mock config module
vi.mock('../config', () => ({
  getAudioUrl: (text: string, language: string = 'vi') => {
    const slug = text.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    return `http://localhost:8000/audio/${language}/${slug}.wav`;
  },
  API_BASE_URL: 'http://localhost:8000',
}));
