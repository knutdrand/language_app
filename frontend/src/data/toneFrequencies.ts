/**
 * Tone sequence frequency data derived from the words.json corpus.
 *
 * Used to prioritize common tone patterns in training.
 * Higher frequency = more important to master early.
 *
 * Based on analysis of 334 Vietnamese words/phrases.
 */

export interface ToneSequenceFrequency {
  key: string;           // e.g., "1-2" for Level → Falling
  count: number;         // occurrences in corpus
  percentage: number;    // percentage of total
}

// Single tones (160 words, 47.9% of corpus)
export const SINGLE_TONE_FREQUENCIES: ToneSequenceFrequency[] = [
  { key: "1", count: 47, percentage: 14.1 },  // Level (ngang)
  { key: "3", count: 42, percentage: 12.6 },  // Rising (sắc)
  { key: "2", count: 29, percentage: 8.7 },   // Falling (huyền)
  { key: "6", count: 22, percentage: 6.6 },   // Heavy (nặng)
  { key: "4", count: 15, percentage: 4.5 },   // Dipping (hỏi)
  { key: "5", count: 5, percentage: 1.5 },    // Creaky (ngã)
];

// Two-tone combinations (most common multi-syllable patterns)
export const TWO_TONE_FREQUENCIES: ToneSequenceFrequency[] = [
  { key: "1-2", count: 16, percentage: 4.8 },  // Level → Falling
  { key: "2-2", count: 13, percentage: 3.9 },  // Falling → Falling
  { key: "2-1", count: 12, percentage: 3.6 },  // Falling → Level
  { key: "3-2", count: 10, percentage: 3.0 },  // Rising → Falling
  { key: "3-1", count: 9, percentage: 2.7 },   // Rising → Level
  { key: "1-1", count: 7, percentage: 2.1 },   // Level → Level
  { key: "1-6", count: 7, percentage: 2.1 },   // Level → Heavy
  { key: "6-2", count: 7, percentage: 2.1 },   // Heavy → Falling
  { key: "2-3", count: 7, percentage: 2.1 },   // Falling → Rising
  { key: "1-3", count: 6, percentage: 1.8 },   // Level → Rising
  { key: "4-1", count: 6, percentage: 1.8 },   // Dipping → Level
  { key: "3-4", count: 5, percentage: 1.5 },   // Rising → Dipping
  { key: "6-1", count: 4, percentage: 1.2 },   // Heavy → Level
  { key: "3-3", count: 4, percentage: 1.2 },   // Rising → Rising
  { key: "2-6", count: 3, percentage: 0.9 },   // Falling → Heavy
  { key: "6-6", count: 2, percentage: 0.6 },   // Heavy → Heavy
  { key: "1-4", count: 2, percentage: 0.6 },   // Level → Dipping
  { key: "3-6", count: 2, percentage: 0.6 },   // Rising → Heavy
  { key: "6-3", count: 2, percentage: 0.6 },   // Heavy → Rising
];

// All frequencies combined (lookup by sequence key)
export const ALL_FREQUENCIES: Record<string, ToneSequenceFrequency> = {};

for (const freq of [...SINGLE_TONE_FREQUENCIES, ...TWO_TONE_FREQUENCIES]) {
  ALL_FREQUENCIES[freq.key] = freq;
}

/**
 * Get frequency weight for a tone sequence.
 * Returns a value between 0 and 1, where higher = more common.
 * Unknown sequences get a small default weight.
 */
export function getFrequencyWeight(sequenceKey: string): number {
  const freq = ALL_FREQUENCIES[sequenceKey];
  if (freq) {
    // Normalize to 0-1 range (max is ~14%)
    return freq.percentage / 15;
  }
  // Unknown/rare sequences get low weight
  return 0.05;
}

/**
 * Priority tiers for progressive learning.
 * Tier 1: Master these first (single tones + most common combos)
 * Tier 2: Common two-tone combinations
 * Tier 3: Less common patterns
 */
export const PRIORITY_TIERS = {
  tier1: ["1", "3", "2", "6", "4", "5", "1-2", "2-2", "2-1"],  // Top 9 (>3% each)
  tier2: ["3-2", "3-1", "1-1", "1-6", "6-2", "2-3", "1-3", "4-1"],  // Next 8 (1.5-3%)
  tier3: [], // Everything else
};

/**
 * Get the priority tier (1-3) for a sequence.
 * Lower tier = higher priority.
 */
export function getPriorityTier(sequenceKey: string): 1 | 2 | 3 {
  if (PRIORITY_TIERS.tier1.includes(sequenceKey)) return 1;
  if (PRIORITY_TIERS.tier2.includes(sequenceKey)) return 2;
  return 3;
}
