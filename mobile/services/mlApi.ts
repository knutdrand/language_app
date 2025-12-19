/**
 * ML API client for confusion probability model (React Native/Expo).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../config';

const ML_BASE = `${API_BASE_URL}/api/ml`;
const CONFUSION_STATE_KEY = 'language_app_confusion_state';

// Tone types matching backend
export type ToneT = 'level' | 'falling' | 'rising' | 'dipping' | 'creaky' | 'heavy';

export const TONES: ToneT[] = ['level', 'falling', 'rising', 'dipping', 'creaky', 'heavy'];

// Map tone number (1-6) to tone name
export const TONE_NUMBER_TO_NAME: Record<number, ToneT> = {
  1: 'level',
  2: 'falling',
  3: 'rising',
  4: 'dipping',
  5: 'creaky',
  6: 'heavy',
};

// Map tone name to number (1-6)
export const TONE_NAME_TO_NUMBER: Record<ToneT, number> = {
  level: 1,
  falling: 2,
  rising: 3,
  dipping: 4,
  creaky: 5,
  heavy: 6,
};

export interface Problem {
  tone: ToneT;
  letter?: string;
  playback_speed?: number;
  voice?: string;
}

export interface ConfusionState {
  counts: number[][];
}

export type ConfusionProbs = Record<ToneT, number>;

/**
 * Get initial confusion state from backend.
 */
export async function getInitialState(priorStrength = 1.0): Promise<ConfusionState> {
  try {
    const response = await fetch(`${ML_BASE}/initial-state?prior_strength=${priorStrength}`);
    if (!response.ok) throw new Error('Failed to get initial state');
    const data = await response.json();
    return data.state;
  } catch (e) {
    console.error('Failed to get initial state from backend:', e);
    return createDefaultState(priorStrength);
  }
}

/**
 * Create default state locally (fallback if backend unavailable).
 */
function createDefaultState(priorStrength = 1.0): ConfusionState {
  const counts: number[][] = [];
  for (let i = 0; i < 6; i++) {
    counts[i] = [];
    for (let j = 0; j < 6; j++) {
      counts[i][j] = priorStrength * (i === j ? 3 : 1);
    }
  }
  return { counts };
}

/**
 * Get confusion probabilities for a single problem.
 */
export async function getConfusionProb(
  problem: Problem,
  state: ConfusionState
): Promise<ConfusionProbs> {
  try {
    const response = await fetch(`${ML_BASE}/confusion-prob`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ problem, state }),
    });
    if (!response.ok) throw new Error('Failed to get confusion prob');
    return response.json();
  } catch (e) {
    console.error('Failed to get confusion prob from backend:', e);
    return calculateConfusionProbLocal(problem, state);
  }
}

/**
 * Get confusion probabilities for multiple problems.
 */
export async function getConfusionProbBatch(
  problems: Problem[],
  state: ConfusionState
): Promise<ConfusionProbs[]> {
  try {
    const response = await fetch(`${ML_BASE}/confusion-prob-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ problems, state }),
    });
    if (!response.ok) throw new Error('Failed to get confusion prob batch');
    return response.json();
  } catch (e) {
    console.error('Failed to get confusion prob batch from backend:', e);
    return problems.map((p) => calculateConfusionProbLocal(p, state));
  }
}

/**
 * Update state after user answers.
 */
export async function updateState(
  state: ConfusionState,
  problem: Problem,
  alternatives: ToneT[],
  choice: ToneT
): Promise<ConfusionState> {
  try {
    const response = await fetch(`${ML_BASE}/update-state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state, problem, alternatives, choice }),
    });
    if (!response.ok) throw new Error('Failed to update state');
    return response.json();
  } catch (e) {
    console.error('Failed to update state from backend:', e);
    return updateStateLocal(state, problem, choice);
  }
}

/**
 * Get error probability for priority scoring.
 */
export async function getErrorProb(
  problem: Problem,
  alternatives: ToneT[],
  state: ConfusionState
): Promise<number> {
  try {
    const response = await fetch(`${ML_BASE}/error-prob`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ problem, alternatives, state }),
    });
    if (!response.ok) throw new Error('Failed to get error prob');
    return response.json();
  } catch (e) {
    console.error('Failed to get error prob from backend:', e);
    const probs = calculateConfusionProbLocal(problem, state);
    const correctProb = probs[problem.tone];
    const altProbs = alternatives.map((t) => probs[t]);
    const normalizedCorrect = correctProb / altProbs.reduce((a, b) => a + b, 0);
    return 1 - normalizedCorrect;
  }
}

// Local calculations as fallback

function calculateConfusionProbLocal(problem: Problem, state: ConfusionState): ConfusionProbs {
  const toneIdx = TONE_NAME_TO_NUMBER[problem.tone] - 1;
  const row = state.counts[toneIdx];
  const sum = row.reduce((a, b) => a + b, 0);
  const probs: ConfusionProbs = {} as ConfusionProbs;
  for (let i = 0; i < TONES.length; i++) {
    probs[TONES[i]] = row[i] / sum;
  }
  return probs;
}

function updateStateLocal(
  state: ConfusionState,
  problem: Problem,
  choice: ToneT
): ConfusionState {
  const newCounts = state.counts.map((row) => [...row]);
  const toneIdx = TONE_NAME_TO_NUMBER[problem.tone] - 1;
  const choiceIdx = TONE_NAME_TO_NUMBER[choice] - 1;
  newCounts[toneIdx][choiceIdx] += 1;
  return { counts: newCounts };
}

// AsyncStorage persistence for React Native

export async function loadConfusionState(): Promise<ConfusionState | null> {
  try {
    const stored = await AsyncStorage.getItem(CONFUSION_STATE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to load confusion state from AsyncStorage:', e);
  }
  return null;
}

export async function saveConfusionState(state: ConfusionState): Promise<void> {
  try {
    await AsyncStorage.setItem(CONFUSION_STATE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save confusion state to AsyncStorage:', e);
  }
}

/**
 * Get error probability for a tone sequence.
 * sequenceKey is like "1-2-3", alternatives are tone numbers.
 */
export async function getSequenceErrorProb(
  sequenceKey: string,
  alternativeNumbers: number[],
  state: ConfusionState
): Promise<number> {
  const toneNumbers = sequenceKey.split('-').map(Number);
  const firstTone = TONE_NUMBER_TO_NAME[toneNumbers[0]];
  const alternatives = alternativeNumbers.map((n) => TONE_NUMBER_TO_NAME[n]);

  return getErrorProb({ tone: firstTone }, alternatives, state);
}
