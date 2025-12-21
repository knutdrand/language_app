export type VowelId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export interface Vowel {
  id: VowelId;
  name: string;
  character: string;
  ipa: string;
  example: string;
  color: string;
}

// 12 simple Vietnamese vowels
export const VOWELS: Vowel[] = [
  { id: 1, name: "a", character: "a", ipa: "/aː/", example: "ba", color: "#3B82F6" },
  { id: 2, name: "ă", character: "ă", ipa: "/a/", example: "ăn", color: "#8B5CF6" },
  { id: 3, name: "â", character: "â", ipa: "/ə/", example: "ân", color: "#EF4444" },
  { id: 4, name: "e", character: "e", ipa: "/ɛ/", example: "em", color: "#F59E0B" },
  { id: 5, name: "ê", character: "ê", ipa: "/e/", example: "êm", color: "#10B981" },
  { id: 6, name: "i", character: "i", ipa: "/i/", example: "đi", color: "#6366F1" },
  { id: 7, name: "o", character: "o", ipa: "/ɔ/", example: "bò", color: "#EC4899" },
  { id: 8, name: "ô", character: "ô", ipa: "/o/", example: "cô", color: "#14B8A6" },
  { id: 9, name: "ơ", character: "ơ", ipa: "/əː/", example: "hơ", color: "#F97316" },
  { id: 10, name: "u", character: "u", ipa: "/u/", example: "du", color: "#84CC16" },
  { id: 11, name: "ư", character: "ư", ipa: "/ɨ/", example: "dư", color: "#06B6D4" },
  { id: 12, name: "y", character: "y", ipa: "/i/", example: "my", color: "#A855F7" },
];

export function getVowelById(id: VowelId): Vowel {
  return VOWELS.find((v) => v.id === id)!;
}

// Map all Vietnamese vowel characters (with any tone mark) to their base vowel ID
// Vietnamese has 12 base vowels, each can have 6 tone variants (including no-tone)
const VOWEL_CHAR_MAP: Record<string, VowelId> = {
  // a (ID 1) - all tone variants
  'a': 1, 'à': 1, 'á': 1, 'ả': 1, 'ã': 1, 'ạ': 1,
  'A': 1, 'À': 1, 'Á': 1, 'Ả': 1, 'Ã': 1, 'Ạ': 1,

  // ă (ID 2) - a with breve, all tone variants
  'ă': 2, 'ằ': 2, 'ắ': 2, 'ẳ': 2, 'ẵ': 2, 'ặ': 2,
  'Ă': 2, 'Ằ': 2, 'Ắ': 2, 'Ẳ': 2, 'Ẵ': 2, 'Ặ': 2,

  // â (ID 3) - a with circumflex, all tone variants
  'â': 3, 'ầ': 3, 'ấ': 3, 'ẩ': 3, 'ẫ': 3, 'ậ': 3,
  'Â': 3, 'Ầ': 3, 'Ấ': 3, 'Ẩ': 3, 'Ẫ': 3, 'Ậ': 3,

  // e (ID 4) - all tone variants
  'e': 4, 'è': 4, 'é': 4, 'ẻ': 4, 'ẽ': 4, 'ẹ': 4,
  'E': 4, 'È': 4, 'É': 4, 'Ẻ': 4, 'Ẽ': 4, 'Ẹ': 4,

  // ê (ID 5) - e with circumflex, all tone variants
  'ê': 5, 'ề': 5, 'ế': 5, 'ể': 5, 'ễ': 5, 'ệ': 5,
  'Ê': 5, 'Ề': 5, 'Ế': 5, 'Ể': 5, 'Ễ': 5, 'Ệ': 5,

  // i (ID 6) - all tone variants
  'i': 6, 'ì': 6, 'í': 6, 'ỉ': 6, 'ĩ': 6, 'ị': 6,
  'I': 6, 'Ì': 6, 'Í': 6, 'Ỉ': 6, 'Ĩ': 6, 'Ị': 6,

  // o (ID 7) - all tone variants
  'o': 7, 'ò': 7, 'ó': 7, 'ỏ': 7, 'õ': 7, 'ọ': 7,
  'O': 7, 'Ò': 7, 'Ó': 7, 'Ỏ': 7, 'Õ': 7, 'Ọ': 7,

  // ô (ID 8) - o with circumflex, all tone variants
  'ô': 8, 'ồ': 8, 'ố': 8, 'ổ': 8, 'ỗ': 8, 'ộ': 8,
  'Ô': 8, 'Ồ': 8, 'Ố': 8, 'Ổ': 8, 'Ỗ': 8, 'Ộ': 8,

  // ơ (ID 9) - o with horn, all tone variants
  'ơ': 9, 'ờ': 9, 'ớ': 9, 'ở': 9, 'ỡ': 9, 'ợ': 9,
  'Ơ': 9, 'Ờ': 9, 'Ớ': 9, 'Ở': 9, 'Ỡ': 9, 'Ợ': 9,

  // u (ID 10) - all tone variants
  'u': 10, 'ù': 10, 'ú': 10, 'ủ': 10, 'ũ': 10, 'ụ': 10,
  'U': 10, 'Ù': 10, 'Ú': 10, 'Ủ': 10, 'Ũ': 10, 'Ụ': 10,

  // ư (ID 11) - u with horn, all tone variants
  'ư': 11, 'ừ': 11, 'ứ': 11, 'ử': 11, 'ữ': 11, 'ự': 11,
  'Ư': 11, 'Ừ': 11, 'Ứ': 11, 'Ử': 11, 'Ữ': 11, 'Ự': 11,

  // y (ID 12) - all tone variants
  'y': 12, 'ỳ': 12, 'ý': 12, 'ỷ': 12, 'ỹ': 12, 'ỵ': 12,
  'Y': 12, 'Ỳ': 12, 'Ý': 12, 'Ỷ': 12, 'Ỹ': 12, 'Ỵ': 12,
};

/**
 * Check if a character is a Vietnamese vowel
 */
export function isVowel(char: string): boolean {
  return VOWEL_CHAR_MAP[char] !== undefined;
}

/**
 * Get the vowel ID for a Vietnamese vowel character (strips tone marks)
 */
export function getVowelId(char: string): VowelId | null {
  return VOWEL_CHAR_MAP[char] ?? null;
}

/**
 * Extract the primary vowel nucleus from a Vietnamese syllable.
 * Returns the vowel ID (1-12) of the primary vowel.
 *
 * Vietnamese syllable structure: (C)(w)V(C)
 * - We find the first vowel character that carries a tone mark, or
 * - The last vowel if no tone mark is found
 *
 * For simple vowels phase, we return the primary vowel only.
 * Diphthongs/triphthongs will be handled in a future phase.
 */
export function extractVowelNucleus(syllable: string): VowelId | null {
  const normalized = syllable.trim();

  // Find all vowel positions
  const vowelPositions: { index: number; char: string; id: VowelId }[] = [];

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    const vowelId = VOWEL_CHAR_MAP[char];
    if (vowelId !== undefined) {
      vowelPositions.push({ index: i, char, id: vowelId });
    }
  }

  if (vowelPositions.length === 0) {
    return null;
  }

  // For single vowel, return it
  if (vowelPositions.length === 1) {
    return vowelPositions[0].id;
  }

  // For multiple vowels (diphthongs/triphthongs), find the "main" vowel
  // In Vietnamese, the main vowel is typically:
  // 1. The vowel that carries the tone mark (if any has a marked tone)
  // 2. For diphthongs, typically the more open vowel

  // Check which vowel has a tone mark (not base form)
  // We can detect this by checking if the character is different from the base vowel
  for (const vp of vowelPositions) {
    const baseVowel = getVowelById(vp.id).character;
    if (vp.char.toLowerCase() !== baseVowel && vp.char.toUpperCase() !== baseVowel.toUpperCase()) {
      // This vowel has a tone mark, so it's the primary vowel
      return vp.id;
    }
  }

  // No tone marks found, use heuristics for common diphthongs
  // In Vietnamese, the "main" vowel in diphthongs is typically:
  // - In "ia", "ua", "ưa": the 'a' is the main vowel
  // - In "oi", "ai", "ui": the first vowel is main
  // - Generally, the more open vowel carries the nucleus

  // Openness order (most open first): a, ă, â, e, ê, o, ô, ơ, u, ư, i, y
  const opennessRank: Record<VowelId, number> = {
    1: 1,  // a - most open
    2: 2,  // ă
    3: 3,  // â
    4: 4,  // e
    5: 5,  // ê
    7: 6,  // o
    8: 7,  // ô
    9: 8,  // ơ
    10: 9,  // u
    11: 10, // ư
    6: 11,  // i
    12: 11, // y - same as i
  };

  // Return the most open vowel
  const sorted = [...vowelPositions].sort((a, b) => opennessRank[a.id] - opennessRank[b.id]);
  return sorted[0].id;
}

/**
 * Split a Vietnamese word/phrase into syllables (by spaces)
 */
export function splitSyllables(word: string): string[] {
  return word.trim().split(/\s+/).filter(Boolean);
}

/**
 * Get the vowel sequence for a word (array of VowelIds)
 */
export function getVowelSequence(word: string): VowelId[] {
  const syllables = splitSyllables(word);
  const sequence: VowelId[] = [];

  for (const syllable of syllables) {
    const vowelId = extractVowelNucleus(syllable);
    if (vowelId !== null) {
      sequence.push(vowelId);
    }
  }

  return sequence;
}

/**
 * Format a vowel sequence for display: "a → ê"
 */
export function formatVowelSequence(sequence: VowelId[]): string {
  return sequence.map((id) => getVowelById(id).character).join(" → ");
}

/**
 * Format a vowel sequence with names: "a → ê"
 */
export function formatVowelSequenceNames(sequence: VowelId[]): string {
  return sequence.map((id) => getVowelById(id).name).join(" → ");
}

/**
 * Create a unique string key for a vowel sequence (e.g., "1-5" for a→ê)
 */
export function getVowelSequenceKey(sequence: VowelId[]): string {
  return sequence.join("-");
}

/**
 * Check if two vowel sequences are equal
 */
export function sequencesEqual(a: VowelId[], b: VowelId[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((vowel, i) => vowel === b[i]);
}

/**
 * All possible vowel pairs (66 combinations = C(12,2))
 */
export function getAllVowelPairs(): [VowelId, VowelId][] {
  const pairs: [VowelId, VowelId][] = [];
  const allVowels: VowelId[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  for (let i = 0; i < allVowels.length; i++) {
    for (let j = i + 1; j < allVowels.length; j++) {
      pairs.push([allVowels[i], allVowels[j]]);
    }
  }
  return pairs;
}

/**
 * Get a single distractor for binary (2-choice) mode.
 * If targetDistractor is provided, use that specific vowel.
 * Otherwise, pick a random vowel different from correct.
 */
export function getSingleDistractor(
  correctVowel: VowelId,
  targetDistractor?: VowelId
): VowelId {
  if (targetDistractor !== undefined && targetDistractor !== correctVowel) {
    return targetDistractor;
  }

  const allVowels: VowelId[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const otherVowels = allVowels.filter(v => v !== correctVowel);
  return otherVowels[Math.floor(Math.random() * otherVowels.length)];
}

/**
 * Shuffle an array (Fisher-Yates)
 */
export function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Phonetic confusion groups - vowels that sound similar and are easily confused
 */
export const VOWEL_CONFUSION_GROUPS: VowelId[][] = [
  [6, 12],       // i, y - nearly identical
  [4, 5],        // e, ê - front vowels
  [1, 2, 3],     // a, ă, â - a-variants
  [7, 8, 9],     // o, ô, ơ - o-variants
  [10, 11],      // u, ư - u-variants
];

/**
 * Get the confusion group for a vowel
 */
export function getConfusionGroup(vowelId: VowelId): VowelId[] {
  for (const group of VOWEL_CONFUSION_GROUPS) {
    if (group.includes(vowelId)) {
      return group;
    }
  }
  return [vowelId];
}
