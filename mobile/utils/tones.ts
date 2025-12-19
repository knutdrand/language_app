export type ToneId = 1 | 2 | 3 | 4 | 5 | 6;

export interface Tone {
  id: ToneId;
  name: string;
  vietnamese: string;
  diacritic: string;
  example: string;
  color: string;
  symbol: string;
}

export const TONES: Tone[] = [
  { id: 1, name: "Level", vietnamese: "Ngang", diacritic: "a", example: "ma", color: "#3B82F6", symbol: "―" },
  { id: 2, name: "Falling", vietnamese: "Huyền", diacritic: "à", example: "mà", color: "#8B5CF6", symbol: "↘" },
  { id: 3, name: "Rising", vietnamese: "Sắc", diacritic: "á", example: "má", color: "#EF4444", symbol: "↗" },
  { id: 4, name: "Dipping", vietnamese: "Hỏi", diacritic: "ả", example: "mả", color: "#F59E0B", symbol: "∨" },
  { id: 5, name: "Creaky", vietnamese: "Ngã", diacritic: "ã", example: "mã", color: "#10B981", symbol: "⤴" },
  { id: 6, name: "Heavy", vietnamese: "Nặng", diacritic: "ạ", example: "mạ", color: "#6366F1", symbol: "↓" },
];

export function getToneById(id: ToneId): Tone {
  return TONES.find((t) => t.id === id)!;
}

// Vietnamese tone diacritics mapped to tone IDs
const TONE_MARKS: Record<string, ToneId> = {
  // Falling (huyền) - grave accent
  à: 2, è: 2, ì: 2, ò: 2, ù: 2, ỳ: 2,
  ằ: 2, ầ: 2, ề: 2, ồ: 2, ờ: 2, ừ: 2,

  // Rising (sắc) - acute accent
  á: 3, é: 3, í: 3, ó: 3, ú: 3, ý: 3,
  ắ: 3, ấ: 3, ế: 3, ố: 3, ớ: 3, ứ: 3,

  // Dipping (hỏi) - hook above
  ả: 4, ẻ: 4, ỉ: 4, ỏ: 4, ủ: 4, ỷ: 4,
  ẳ: 4, ẩ: 4, ể: 4, ổ: 4, ở: 4, ử: 4,

  // Creaky (ngã) - tilde
  ã: 5, ẽ: 5, ĩ: 5, õ: 5, ũ: 5, ỹ: 5,
  ẵ: 5, ẫ: 5, ễ: 5, ỗ: 5, ỡ: 5, ữ: 5,

  // Heavy (nặng) - dot below
  ạ: 6, ẹ: 6, ị: 6, ọ: 6, ụ: 6, ỵ: 6,
  ặ: 6, ậ: 6, ệ: 6, ộ: 6, ợ: 6, ự: 6,
};

/**
 * Detect the tone of a Vietnamese syllable
 */
export function detectTone(syllable: string): ToneId {
  const normalized = syllable.toLowerCase().trim();

  for (const char of normalized) {
    if (TONE_MARKS[char]) {
      return TONE_MARKS[char];
    }
  }

  // No tone mark found = Level tone (ngang)
  return 1;
}

/**
 * Split a Vietnamese word/phrase into syllables (by spaces)
 */
export function splitSyllables(word: string): string[] {
  return word.trim().split(/\s+/).filter(Boolean);
}

/**
 * Get the tone sequence for a word (array of ToneIds)
 */
export function getToneSequence(word: string): ToneId[] {
  return splitSyllables(word).map(detectTone);
}

/**
 * Format a tone sequence for display: "Rising → Falling"
 */
export function formatToneSequence(sequence: ToneId[]): string {
  return sequence.map((id) => getToneById(id).name).join(" → ");
}

/**
 * Format a tone sequence with diacritics: "á → à"
 */
export function formatToneSequenceDiacritics(sequence: ToneId[]): string {
  return sequence.map((id) => getToneById(id).diacritic).join(" → ");
}

/**
 * Format a tone sequence with arrow/line symbols: "↗ ↘"
 */
export function formatToneSymbols(sequence: ToneId[]): string {
  return sequence.map((id) => getToneById(id).symbol).join(" ");
}

/**
 * Create a unique string key for a tone sequence (e.g., "3-2" for Rising→Falling)
 */
export function getToneSequenceKey(sequence: ToneId[]): string {
  return sequence.join("-");
}

/**
 * Check if two tone sequences are equal
 */
export function sequencesEqual(a: ToneId[], b: ToneId[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((tone, i) => tone === b[i]);
}

/**
 * Generate 3 distractor tone sequences (same length, different from correct)
 */
export function getDistractorSequences(correctSequence: ToneId[]): ToneId[][] {
  const distractors: ToneId[][] = [];
  const allToneIds: ToneId[] = [1, 2, 3, 4, 5, 6];
  const seqLength = correctSequence.length;
  const maxAttempts = 100;

  let attempts = 0;
  while (distractors.length < 3 && attempts < maxAttempts) {
    attempts++;

    // Generate a random sequence of the same length
    const newSeq: ToneId[] = [];
    for (let i = 0; i < seqLength; i++) {
      // Pick a random tone, with bias toward changing at least one position
      const shouldChange = Math.random() < 0.7 || i === Math.floor(Math.random() * seqLength);
      if (shouldChange) {
        // Pick a different tone than the correct one at this position
        const otherTones = allToneIds.filter((t) => t !== correctSequence[i]);
        newSeq.push(otherTones[Math.floor(Math.random() * otherTones.length)]);
      } else {
        newSeq.push(correctSequence[i]);
      }
    }

    // Check it's different from correct and not already in distractors
    if (
      !sequencesEqual(newSeq, correctSequence) &&
      !distractors.some((d) => sequencesEqual(d, newSeq))
    ) {
      distractors.push(newSeq);
    }
  }

  // Fallback: if we couldn't generate enough unique distractors, create simple variations
  while (distractors.length < 3) {
    const fallback: ToneId[] = correctSequence.map((tone, i) => {
      if (i === distractors.length % seqLength) {
        // Change this position to a different tone
        const offset = (distractors.length + 1) % 5 + 1;
        return (((tone - 1 + offset) % 6) + 1) as ToneId;
      }
      return tone;
    });
    if (!distractors.some((d) => sequencesEqual(d, fallback))) {
      distractors.push(fallback);
    } else {
      // Just push something different
      distractors.push(correctSequence.map((t) => (((t % 6) + 1) as ToneId)));
      break;
    }
  }

  return distractors.slice(0, 3);
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
 * All possible tone pairs (15 combinations)
 */
export function getAllTonePairs(): [ToneId, ToneId][] {
  const pairs: [ToneId, ToneId][] = [];
  const allTones: ToneId[] = [1, 2, 3, 4, 5, 6];
  for (let i = 0; i < allTones.length; i++) {
    for (let j = i + 1; j < allTones.length; j++) {
      pairs.push([allTones[i], allTones[j]]);
    }
  }
  return pairs;
}

/**
 * Get a single distractor for binary (2-choice) mode.
 * If targetDistractor is provided, use that specific tone.
 * Otherwise, pick a random tone different from correct.
 */
export function getSingleDistractor(
  correctTone: ToneId,
  targetDistractor?: ToneId
): ToneId {
  if (targetDistractor !== undefined && targetDistractor !== correctTone) {
    return targetDistractor;
  }

  const allTones: ToneId[] = [1, 2, 3, 4, 5, 6];
  const otherTones = allTones.filter(t => t !== correctTone);
  return otherTones[Math.floor(Math.random() * otherTones.length)];
}

/**
 * Get single distractor sequence for a multi-syllable word in 2-choice mode.
 * Changes one random position to create a different sequence.
 */
export function getSingleDistractorSequence(
  correctSequence: ToneId[],
  targetPair?: [ToneId, ToneId]
): ToneId[] {
  if (correctSequence.length === 1) {
    // Single syllable: just get single distractor
    const distractor = targetPair
      ? (targetPair[0] === correctSequence[0] ? targetPair[1] : targetPair[0])
      : getSingleDistractor(correctSequence[0]);
    return [distractor];
  }

  // Multi-syllable: change one position
  const result = [...correctSequence];
  const posToChange = Math.floor(Math.random() * result.length);
  result[posToChange] = getSingleDistractor(correctSequence[posToChange]);
  return result;
}
