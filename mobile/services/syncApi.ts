import { API_BASE_URL } from '../config';
import { authFetch, getStoredAccessToken } from './authApi';

const SYNC_BASE = `${API_BASE_URL}/api/sync`;

export interface WordCardSync {
  word_id: number;
  card: Record<string, unknown>;
}

export interface ToneCardSync {
  sequence_key: string;
  card: Record<string, unknown>;
  correct: number;
  total: number;
}

export interface ProgressData {
  reviews_today: number;
  correct_today: number;
  last_review_date: string;
  total_reviews: number;
  total_correct: number;
}

export interface ConfusionState {
  counts: number[][];
}

export interface SyncData {
  word_cards: WordCardSync[];
  tone_cards: ToneCardSync[];
  progress: ProgressData;
  confusion_state: ConfusionState | null;
}

export async function isAuthenticated(): Promise<boolean> {
  const token = await getStoredAccessToken();
  return token !== null;
}

export async function getSyncData(): Promise<SyncData> {
  const response = await authFetch(SYNC_BASE);
  if (!response.ok) {
    throw new Error('Failed to fetch sync data');
  }
  return response.json();
}

export async function updateSyncData(data: Partial<{
  word_cards: WordCardSync[];
  tone_cards: ToneCardSync[];
  progress: Partial<ProgressData>;
  confusion_state: ConfusionState;
}>): Promise<void> {
  const response = await authFetch(SYNC_BASE, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error('Failed to update sync data');
  }
}

export async function updateWordCard(wordId: number, card: Record<string, unknown>): Promise<void> {
  const response = await authFetch(`${SYNC_BASE}/word-card/${wordId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ word_id: wordId, card }),
  });
  if (!response.ok) {
    throw new Error('Failed to update word card');
  }
}

export async function updateToneCard(
  sequenceKey: string,
  card: Record<string, unknown>,
  correct: number,
  total: number
): Promise<void> {
  const response = await authFetch(`${SYNC_BASE}/tone-card/${encodeURIComponent(sequenceKey)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sequence_key: sequenceKey, card, correct, total }),
  });
  if (!response.ok) {
    throw new Error('Failed to update tone card');
  }
}

export async function recordReview(correct: boolean): Promise<ProgressData> {
  const response = await authFetch(`${SYNC_BASE}/record-review?correct=${correct}`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error('Failed to record review');
  }
  return response.json();
}

export async function updateConfusionState(confusionState: ConfusionState): Promise<void> {
  const response = await authFetch(SYNC_BASE, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confusion_state: confusionState }),
  });
  if (!response.ok) {
    throw new Error('Failed to update confusion state');
  }
}
