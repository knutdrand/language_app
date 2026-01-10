import { API_BASE_URL } from '../config';
import type { Word } from '../types';

export async function fetchWords(limit?: number, offset?: number): Promise<Word[]> {
  const params = new URLSearchParams();
  if (limit !== undefined) {
    params.set('limit', String(limit));
  }
  if (offset !== undefined) {
    params.set('offset', String(offset));
  }

  const query = params.toString();
  const url = `${API_BASE_URL}/api/words${query ? `?${query}` : ''}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch words: ${response.status}`);
  }
  return response.json();
}
