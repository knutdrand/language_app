"""
Vowel drill service - handles sampling and state transitions for vowel drills.

Mirrors the tone drill service but for Vietnamese vowel discrimination.
"""
import json
import random
from pathlib import Path
from typing import Optional, Literal
from dataclasses import dataclass, field
from pydantic import BaseModel

# Load words data
WORDS_PATH = Path(__file__).parent.parent.parent.parent / "frontend" / "src" / "data" / "words.json"

# Number of vowels
NUM_VOWELS = 12

# Map all Vietnamese vowel characters (with any tone mark) to their base vowel ID (1-indexed)
VOWEL_CHAR_MAP = {
    # a (ID 1) - all tone variants
    'a': 1, 'à': 1, 'á': 1, 'ả': 1, 'ã': 1, 'ạ': 1,

    # ă (ID 2) - a with breve, all tone variants
    'ă': 2, 'ằ': 2, 'ắ': 2, 'ẳ': 2, 'ẵ': 2, 'ặ': 2,

    # â (ID 3) - a with circumflex, all tone variants
    'â': 3, 'ầ': 3, 'ấ': 3, 'ẩ': 3, 'ẫ': 3, 'ậ': 3,

    # e (ID 4) - all tone variants
    'e': 4, 'è': 4, 'é': 4, 'ẻ': 4, 'ẽ': 4, 'ẹ': 4,

    # ê (ID 5) - e with circumflex, all tone variants
    'ê': 5, 'ề': 5, 'ế': 5, 'ể': 5, 'ễ': 5, 'ệ': 5,

    # i (ID 6) - all tone variants
    'i': 6, 'ì': 6, 'í': 6, 'ỉ': 6, 'ĩ': 6, 'ị': 6,

    # o (ID 7) - all tone variants
    'o': 7, 'ò': 7, 'ó': 7, 'ỏ': 7, 'õ': 7, 'ọ': 7,

    # ô (ID 8) - o with circumflex, all tone variants
    'ô': 8, 'ồ': 8, 'ố': 8, 'ổ': 8, 'ỗ': 8, 'ộ': 8,

    # ơ (ID 9) - o with horn, all tone variants
    'ơ': 9, 'ờ': 9, 'ớ': 9, 'ở': 9, 'ỡ': 9, 'ợ': 9,

    # u (ID 10) - all tone variants
    'u': 10, 'ù': 10, 'ú': 10, 'ủ': 10, 'ũ': 10, 'ụ': 10,

    # ư (ID 11) - u with horn, all tone variants
    'ư': 11, 'ừ': 11, 'ứ': 11, 'ử': 11, 'ữ': 11, 'ự': 11,

    # y (ID 12) - all tone variants
    'y': 12, 'ỳ': 12, 'ý': 12, 'ỷ': 12, 'ỹ': 12, 'ỵ': 12,
}

# Phonetic confusion groups - vowels that sound similar
VOWEL_CONFUSION_GROUPS = [
    [5, 11],      # i, y - nearly identical (0-indexed: 5, 11)
    [3, 4],       # e, ê - front vowels (0-indexed: 3, 4)
    [0, 1, 2],    # a, ă, â - a-variants (0-indexed: 0, 1, 2)
    [6, 7, 8],    # o, ô, ơ - o-variants (0-indexed: 6, 7, 8)
    [9, 10],      # u, ư - u-variants (0-indexed: 9, 10)
]

# Vowel names for display
VOWEL_NAMES = ['a', 'ă', 'â', 'e', 'ê', 'i', 'o', 'ô', 'ơ', 'u', 'ư', 'y']

# Mastery thresholds
PAIR_MASTERY_THRESHOLD = 0.80
FOUR_CHOICE_MASTERY_THRESHOLD = 0.80
MIN_TOTAL_2CHOICE_ATTEMPTS = 200  # Higher than tone (100) since more pairs

# Pseudocounts for probability smoothing (Bayesian prior)
PSEUDOCOUNT = 5

DifficultyLevel = Literal["2-choice", "4-choice", "multi-syllable"]


class Word(BaseModel):
    id: int
    vietnamese: str
    english: str
    imageUrl: Optional[str] = None


@dataclass
class VowelConfusionState:
    """12x12 confusion matrix tracking vowel confusions.

    Attributes:
        counts: Global 12x12 matrix for all contexts
        counts_by_context: Per-context matrices keyed by "syllable_count-position"
    """
    counts: list[list[int]] = field(default_factory=lambda: [[0] * NUM_VOWELS for _ in range(NUM_VOWELS)])
    counts_by_context: dict[str, list[list[int]]] = field(default_factory=dict)

    @staticmethod
    def get_context_key(syllable_count: int, position: int) -> str:
        """Generate context key. Cap syllable_count at 3, position at 2."""
        syl = min(syllable_count, 3)
        pos = min(position, 2)
        return f"{syl}-{pos}"


def extract_vowel_nucleus(syllable: str) -> Optional[int]:
    """
    Extract the primary vowel nucleus from a Vietnamese syllable.
    Returns the vowel ID (1-12) of the primary vowel, or None if no vowel found.

    For multiple vowels (diphthongs/triphthongs), returns the main vowel:
    - The vowel that carries the tone mark (if any)
    - Otherwise, the most open vowel
    """
    normalized = syllable.lower().strip()

    # Find all vowel positions
    vowel_positions = []
    for i, char in enumerate(normalized):
        vowel_id = VOWEL_CHAR_MAP.get(char)
        if vowel_id is not None:
            vowel_positions.append((i, char, vowel_id))

    if not vowel_positions:
        return None

    if len(vowel_positions) == 1:
        return vowel_positions[0][2]

    # For multiple vowels, find the "main" vowel
    # Check which vowel has a tone mark (not base form)
    base_vowels = set(VOWEL_NAMES)
    for _, char, vowel_id in vowel_positions:
        if char not in base_vowels:
            # This vowel has a tone mark, so it's the primary vowel
            return vowel_id

    # No tone marks found, use openness heuristics
    # Openness order (most open first): a, ă, â, e, ê, o, ô, ơ, u, ư, i, y
    openness_rank = {
        1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 7: 6, 8: 7, 9: 8, 10: 9, 11: 10, 6: 11, 12: 11
    }

    # Return the most open vowel
    sorted_vowels = sorted(vowel_positions, key=lambda x: openness_rank.get(x[2], 12))
    return sorted_vowels[0][2]


def get_vowel_sequence(word: str) -> list[int]:
    """Get the vowel sequence for a word (list of 1-indexed vowel IDs)."""
    syllables = word.strip().split()
    sequence = []
    for s in syllables:
        vowel_id = extract_vowel_nucleus(s)
        if vowel_id is not None:
            sequence.append(vowel_id)
    return sequence


def get_vowel_sequence_key(sequence: list[int]) -> str:
    """Create a unique string key for a vowel sequence (e.g., '1-5' for a→ê)."""
    return "-".join(str(v) for v in sequence)


class VowelDrillService:
    """Service for vowel drill sampling and state management."""

    def __init__(self):
        self._words: list[Word] = []
        self._words_by_sequence: dict[str, list[Word]] = {}
        self._load_words()

    def _load_words(self):
        """Load words from JSON file and index by vowel sequence."""
        if WORDS_PATH.exists():
            with open(WORDS_PATH) as f:
                data = json.load(f)
                self._words = [Word(**w) for w in data]

        # Index words by their vowel sequence key
        for word in self._words:
            sequence = get_vowel_sequence(word.vietnamese)
            if sequence:  # Only index if word has vowels
                key = get_vowel_sequence_key(sequence)
                if key not in self._words_by_sequence:
                    self._words_by_sequence[key] = []
                self._words_by_sequence[key].append(word)

    def get_all_sequence_keys(self) -> list[str]:
        """Get all sequence keys that have words."""
        return list(self._words_by_sequence.keys())

    @staticmethod
    def get_all_pairs() -> list[tuple[int, int]]:
        """Get all 66 possible pairs of vowels (C(12,2) = 66). 0-indexed."""
        pairs = []
        for a in range(NUM_VOWELS):
            for b in range(a + 1, NUM_VOWELS):
                pairs.append((a, b))
        return pairs

    @staticmethod
    def get_confusion_group(vowel_idx: int) -> list[int]:
        """Get the phonetic confusion group for a vowel (0-indexed)."""
        for group in VOWEL_CONFUSION_GROUPS:
            if vowel_idx in group:
                return group
        return [vowel_idx]

    @staticmethod
    def sample_four_choice_set(confusion_state: Optional[VowelConfusionState]) -> list[int]:
        """
        Sample a 4-choice set using heuristic based on confusion groups.

        Since C(12,4) = 495 is too many to track, we use a heuristic:
        1. Sample most confused pair based on error probability
        2. Add 2 more vowels from phonetically related groups
        """
        # Get all pairs and their error probabilities
        all_pairs = VowelDrillService.get_all_pairs()
        error_probs = [
            VowelDrillService.get_pair_error_probability(confusion_state, a, b)
            for a, b in all_pairs
        ]

        # Sample a pair weighted by error probability
        pair_idx = VowelDrillService.weighted_sample(error_probs)
        pair = list(all_pairs[pair_idx])

        # Get confusion groups for both vowels in the pair
        group1 = VowelDrillService.get_confusion_group(pair[0])
        group2 = VowelDrillService.get_confusion_group(pair[1])

        # Collect candidate vowels from both groups
        candidates = set(group1 + group2) - set(pair)

        # If we have enough candidates from groups, sample from them
        if len(candidates) >= 2:
            additional = random.sample(list(candidates), 2)
        else:
            # Fill with random vowels not in pair
            all_vowels = list(range(NUM_VOWELS))
            remaining = [v for v in all_vowels if v not in pair]
            needed = 2 - len(candidates)
            if needed > 0:
                additional = list(candidates) + random.sample(
                    [v for v in remaining if v not in candidates], needed
                )
            else:
                additional = list(candidates)[:2]

        result = sorted(pair + additional)
        return result

    @staticmethod
    def weighted_sample(weights: list[float]) -> int:
        """Sample an index from an array of weights proportional to their values."""
        total = sum(weights)
        if total == 0:
            return random.randint(0, len(weights) - 1)

        r = random.random() * total
        for i, w in enumerate(weights):
            r -= w
            if r <= 0:
                return i
        return len(weights) - 1

    @staticmethod
    def get_total_attempts(confusion_state: Optional[VowelConfusionState]) -> int:
        """Get total attempts from confusion matrix (sum of all cells)."""
        if not confusion_state:
            return 0
        return sum(sum(row) for row in confusion_state.counts)

    @staticmethod
    def get_pair_error_probability(confusion_state: Optional[VowelConfusionState], a: int, b: int) -> float:
        """
        Calculate P(error) for a 2-choice drill with given alternatives (0-indexed).
        Uses pseudocounts (Bayesian smoothing) to avoid extreme probabilities.
        """
        counts = confusion_state.counts if confusion_state else [[0] * NUM_VOWELS for _ in range(NUM_VOWELS)]

        # P(error | a played, choices={a,b}) = P(choose b | a played)
        counts_aa = counts[a][a] if a < len(counts) and a < len(counts[a]) else 0
        counts_ab = counts[a][b] if a < len(counts) and b < len(counts[a]) else 0
        total_a = counts_aa + counts_ab
        error_given_a = (counts_ab + PSEUDOCOUNT) / (total_a + 2 * PSEUDOCOUNT)

        # P(error | b played, choices={a,b}) = P(choose a | b played)
        counts_bb = counts[b][b] if b < len(counts) and b < len(counts[b]) else 0
        counts_ba = counts[b][a] if b < len(counts) and a < len(counts[b]) else 0
        total_b = counts_bb + counts_ba
        error_given_b = (counts_ba + PSEUDOCOUNT) / (total_b + 2 * PSEUDOCOUNT)

        return 0.5 * error_given_a + 0.5 * error_given_b

    @staticmethod
    def get_pair_correct_probability(confusion_state: Optional[VowelConfusionState], a: int, b: int) -> float:
        """Calculate P(correct) for a 2-choice drill with given alternatives."""
        return 1 - VowelDrillService.get_pair_error_probability(confusion_state, a, b)

    @staticmethod
    def get_four_choice_error_probability(confusion_state: Optional[VowelConfusionState], alternatives: list[int]) -> float:
        """
        Calculate P(error) for a 4-choice drill with given alternatives (0-indexed).
        Uses pseudocounts (Bayesian smoothing) to avoid extreme probabilities.
        """
        if len(alternatives) != 4:
            return 0.75

        counts = confusion_state.counts if confusion_state else [[0] * NUM_VOWELS for _ in range(NUM_VOWELS)]
        total_error = 0.0

        for vowel in alternatives:
            sum_counts = sum(counts[vowel][alt] for alt in alternatives if vowel < len(counts) and alt < len(counts[vowel]))
            correct_count = counts[vowel][vowel] if vowel < len(counts) and vowel < len(counts[vowel]) else 0
            correct_prob = (correct_count + PSEUDOCOUNT) / (sum_counts + 4 * PSEUDOCOUNT)
            total_error += (1 - correct_prob)

        return total_error / 4

    @staticmethod
    def get_four_choice_correct_probability(confusion_state: Optional[VowelConfusionState], alternatives: list[int]) -> float:
        """Calculate P(correct) for a 4-choice drill with given alternatives."""
        return 1 - VowelDrillService.get_four_choice_error_probability(confusion_state, alternatives)

    @staticmethod
    def are_all_pairs_mastered(confusion_state: Optional[VowelConfusionState]) -> bool:
        """Check if all 66 vowel pairs are mastered (>80% correct probability)."""
        if not confusion_state:
            return False

        total_attempts = VowelDrillService.get_total_attempts(confusion_state)
        if total_attempts < MIN_TOTAL_2CHOICE_ATTEMPTS:
            return False

        all_pairs = VowelDrillService.get_all_pairs()
        for a, b in all_pairs:
            correct_prob = VowelDrillService.get_pair_correct_probability(confusion_state, a, b)
            if correct_prob < PAIR_MASTERY_THRESHOLD:
                return False
        return True

    @staticmethod
    def are_four_choice_sets_mastered(confusion_state: Optional[VowelConfusionState]) -> bool:
        """
        Check if four-choice proficiency is sufficient.
        Since we use heuristic sampling, we check average proficiency across confusion groups.
        """
        if not confusion_state:
            return False

        # Sample several representative 4-choice sets and check their mastery
        num_samples = 20
        mastered_count = 0

        for _ in range(num_samples):
            sample_set = VowelDrillService.sample_four_choice_set(confusion_state)
            correct_prob = VowelDrillService.get_four_choice_correct_probability(confusion_state, sample_set)
            if correct_prob >= FOUR_CHOICE_MASTERY_THRESHOLD:
                mastered_count += 1

        return mastered_count >= num_samples * 0.8  # 80% of samples mastered

    @staticmethod
    def get_difficulty_level(confusion_state: Optional[VowelConfusionState]) -> DifficultyLevel:
        """Determine current difficulty level based on mastery."""
        if not VowelDrillService.are_all_pairs_mastered(confusion_state):
            return "2-choice"
        if not VowelDrillService.are_four_choice_sets_mastered(confusion_state):
            return "4-choice"
        return "multi-syllable"

    def get_mono_syllabic_words(self, vowel: int) -> list[Word]:
        """Get mono-syllabic words with the given vowel (1-indexed)."""
        key = str(vowel)
        return self._words_by_sequence.get(key, [])

    def get_any_mono_syllabic_word(self) -> Optional[tuple[Word, str, list[int]]]:
        """Get any mono-syllabic word as fallback. Returns (word, sequenceKey, alternatives)."""
        shuffled_vowels = list(range(1, NUM_VOWELS + 1))
        random.shuffle(shuffled_vowels)

        for vowel in shuffled_vowels:
            words = self.get_mono_syllabic_words(vowel)
            if words:
                word = random.choice(words)
                other_vowel = vowel + 1 if vowel < NUM_VOWELS else vowel - 1
                # Return 0-indexed alternatives
                return (word, str(vowel), [vowel - 1, other_vowel - 1])
        return None

    def get_any_word(self) -> Optional[tuple[Word, str]]:
        """Get any word as last resort fallback."""
        for key, words in self._words_by_sequence.items():
            if words:
                return (random.choice(words), key)
        return None

    def sample_next_drill(
        self,
        confusion_state: Optional[VowelConfusionState],
    ) -> Optional[dict]:
        """
        Sample the next drill based on current difficulty level.
        Returns dict with word, sequence_key, correct_sequence, alternatives.

        20% of the time, preview the next difficulty level.
        """
        difficulty = self.get_difficulty_level(confusion_state)

        # 20% preview of next level (unless already at max level)
        if random.random() < 0.2:
            if difficulty == "2-choice":
                return self._sample_4_choice(confusion_state)
            elif difficulty == "4-choice":
                return self._sample_2_syllable(confusion_state)

        if difficulty == "2-choice":
            return self._sample_2_choice(confusion_state)
        elif difficulty == "4-choice":
            return self._sample_4_choice(confusion_state)
        else:
            return self._sample_multi_syllable(confusion_state)

    def _sample_2_choice(self, confusion_state: Optional[VowelConfusionState]) -> Optional[dict]:
        """Sample a 2-choice drill weighted by error probability."""
        all_pairs = self.get_all_pairs()
        error_probs = [self.get_pair_error_probability(confusion_state, a, b) for a, b in all_pairs]
        selected_pair_idx = self.weighted_sample(error_probs)
        selected_pair = all_pairs[selected_pair_idx]

        # Sample vowel uniformly from the pair (0-indexed)
        selected_vowel_idx = 0 if random.random() < 0.5 else 1
        selected_vowel = selected_pair[selected_vowel_idx]

        # Find mono-syllabic words with this vowel (1-indexed for lookup)
        words = self.get_mono_syllabic_words(selected_vowel + 1)

        if not words:
            # Try the other vowel in the pair
            other_vowel = selected_pair[1 - selected_vowel_idx]
            words = self.get_mono_syllabic_words(other_vowel + 1)
            if words:
                selected_vowel = other_vowel

        if not words:
            # Fallback
            fallback = self.get_any_mono_syllabic_word()
            if fallback:
                word, seq_key, alts = fallback
                return {
                    "word": word,
                    "sequence_key": seq_key,
                    "correct_sequence": [int(v) for v in seq_key.split("-")],
                    "alternatives": [[a + 1] for a in alts],  # 1-indexed
                }
            return None

        word = random.choice(words)
        sequence_key = str(selected_vowel + 1)  # 1-indexed
        correct_sequence = [selected_vowel + 1]  # 1-indexed

        # Alternatives are the pair vowels as sequences (1-indexed)
        alternatives = [[selected_pair[0] + 1], [selected_pair[1] + 1]]

        return {
            "word": word,
            "sequence_key": sequence_key,
            "correct_sequence": correct_sequence,
            "alternatives": alternatives,
        }

    def _sample_4_choice(self, confusion_state: Optional[VowelConfusionState]) -> Optional[dict]:
        """Sample a 4-choice drill using heuristic set sampling."""
        selected_set = self.sample_four_choice_set(confusion_state)  # 0-indexed

        # Shuffle to try vowels in random order
        shuffled_indices = list(range(4))
        random.shuffle(shuffled_indices)

        word = None
        selected_vowel = None

        for idx in shuffled_indices:
            vowel = selected_set[idx]  # 0-indexed
            words = self.get_mono_syllabic_words(vowel + 1)  # 1-indexed for lookup
            if words:
                word = random.choice(words)
                selected_vowel = vowel
                break

        if not word:
            # Fallback
            fallback = self.get_any_mono_syllabic_word()
            if fallback:
                word, seq_key, _ = fallback
                return {
                    "word": word,
                    "sequence_key": seq_key,
                    "correct_sequence": [int(v) for v in seq_key.split("-")],
                    "alternatives": [[v + 1] for v in selected_set],  # 1-indexed
                }
            return None

        sequence_key = str(selected_vowel + 1)  # 1-indexed
        correct_sequence = [selected_vowel + 1]  # 1-indexed
        alternatives = [[v + 1] for v in selected_set]  # 1-indexed

        return {
            "word": word,
            "sequence_key": sequence_key,
            "correct_sequence": correct_sequence,
            "alternatives": alternatives,
        }

    def _sample_2_syllable(self, confusion_state: Optional[VowelConfusionState]) -> Optional[dict]:
        """Sample a 2-syllable drill with per-position pair alternatives (2x2=4)."""
        # Get all 2-syllable sequence keys
        two_syllable_keys = [k for k in self.get_all_sequence_keys()
                             if len(k.split('-')) == 2]

        if not two_syllable_keys:
            return self._sample_multi_syllable(confusion_state)

        # Sample first position pair (weighted by error prob)
        all_pairs = self.get_all_pairs()
        error_probs_1 = [self.get_pair_error_probability(confusion_state, a, b)
                         for a, b in all_pairs]
        pair1_idx = self.weighted_sample(error_probs_1)
        pair1 = all_pairs[pair1_idx]

        # Sample second position pair
        error_probs_2 = [self.get_pair_error_probability(confusion_state, a, b)
                         for a, b in all_pairs]
        pair2_idx = self.weighted_sample(error_probs_2)
        pair2 = all_pairs[pair2_idx]

        # Sample target vowel from each pair
        vowel1 = pair1[0 if random.random() < 0.5 else 1]
        vowel2 = pair2[0 if random.random() < 0.5 else 1]
        target_key = f"{vowel1 + 1}-{vowel2 + 1}"  # 1-indexed

        # Find word with this sequence
        words = self._words_by_sequence.get(target_key, [])
        if not words:
            # Try any 2-syllable word with vowels from the pairs
            for v1 in pair1:
                for v2 in pair2:
                    key = f"{v1 + 1}-{v2 + 1}"
                    words = self._words_by_sequence.get(key, [])
                    if words:
                        target_key = key
                        vowel1, vowel2 = v1, v2
                        break
                if words:
                    break

        if not words:
            # Fallback: any 2-syllable word
            for key in two_syllable_keys:
                words = self._words_by_sequence.get(key, [])
                if words:
                    target_key = key
                    vowels = [int(v) - 1 for v in key.split('-')]
                    vowel1, vowel2 = vowels[0], vowels[1]
                    pair1 = (vowel1, (vowel1 + 1) % NUM_VOWELS)
                    pair2 = (vowel2, (vowel2 + 1) % NUM_VOWELS)
                    break

        if not words:
            return self._sample_multi_syllable(confusion_state)

        word = random.choice(words)
        correct_sequence = [int(v) for v in target_key.split('-')]

        # Build 4 alternatives (2x2 combinations, 1-indexed)
        alternatives = [
            [pair1[0] + 1, pair2[0] + 1],
            [pair1[0] + 1, pair2[1] + 1],
            [pair1[1] + 1, pair2[0] + 1],
            [pair1[1] + 1, pair2[1] + 1],
        ]
        random.shuffle(alternatives)

        return {
            "word": word,
            "sequence_key": target_key,
            "correct_sequence": correct_sequence,
            "alternatives": alternatives,
        }

    def _sample_multi_syllable(self, confusion_state: Optional[VowelConfusionState]) -> Optional[dict]:
        """Sample a multi-syllable drill using priority scoring."""
        all_keys = self.get_all_sequence_keys()

        # Calculate priority scores
        scored = []
        for key in all_keys:
            score = self._calculate_priority_score(key, confusion_state)
            if score > 0:
                scored.append((key, score))

        if not scored:
            fallback = self.get_any_word()
            if fallback:
                word, key = fallback
                correct_sequence = [int(v) for v in key.split("-")]
                alternatives = self._generate_distractors(correct_sequence)
                return {
                    "word": word,
                    "sequence_key": key,
                    "correct_sequence": correct_sequence,
                    "alternatives": alternatives,
                }
            return None

        # Sort by score and sample from top 3
        scored.sort(key=lambda x: x[1], reverse=True)
        top_n = min(3, len(scored))
        total_score = sum(s[1] for s in scored[:top_n])
        r = random.random() * total_score

        selected_key = scored[0][0]
        for i in range(top_n):
            r -= scored[i][1]
            if r <= 0:
                selected_key = scored[i][0]
                break

        words = self._words_by_sequence.get(selected_key, [])
        if not words:
            return None

        word = random.choice(words)
        correct_sequence = [int(v) for v in selected_key.split("-")]
        alternatives = self._generate_distractors(correct_sequence)

        return {
            "word": word,
            "sequence_key": selected_key,
            "correct_sequence": correct_sequence,
            "alternatives": alternatives,
        }

    def _calculate_priority_score(self, sequence_key: str, confusion_state: Optional[VowelConfusionState]) -> float:
        """Calculate priority score for a vowel sequence."""
        syllable_count = len(sequence_key.split("-"))

        # Syllable penalty: prefer shorter sequences
        syllable_penalty = {1: 1.0, 2: 0.5, 3: 0.25}.get(syllable_count, 0.1)

        # Confusion factor
        confusion_factor = self._get_confusion_factor(sequence_key, confusion_state)
        error_prob = confusion_factor - 1.0
        confusion_priority = 0.5 + error_prob

        return syllable_penalty * confusion_priority

    def _get_confusion_factor(self, sequence_key: str, confusion_state: Optional[VowelConfusionState]) -> float:
        """Calculate confusion-based difficulty factor. Returns >= 1.0."""
        if not confusion_state:
            return 1.0

        vowel_numbers = [int(v) for v in sequence_key.split("-")]
        total_confusion = 0.0

        for vowel_num in vowel_numbers:
            vowel_idx = vowel_num - 1
            if 0 <= vowel_idx < len(confusion_state.counts):
                row = confusion_state.counts[vowel_idx]
                row_sum = sum(row)
                if row_sum > 0:
                    correct_prob = row[vowel_idx] / row_sum
                    total_confusion += 1 + (1 - correct_prob)
                else:
                    total_confusion += 1.0
            else:
                total_confusion += 1.0

        return total_confusion / len(vowel_numbers)

    def _generate_distractors(self, correct_sequence: list[int]) -> list[list[int]]:
        """Generate distractor sequences for multi-syllable mode. Returns 4 alternatives including correct."""
        all_vowels = list(range(1, NUM_VOWELS + 1))
        distractors = [correct_sequence]
        max_attempts = 100
        attempts = 0

        while len(distractors) < 4 and attempts < max_attempts:
            attempts += 1
            new_seq = []
            for correct_vowel in correct_sequence:
                # 70% chance to change this position
                if random.random() < 0.7:
                    other_vowels = [v for v in all_vowels if v != correct_vowel]
                    new_seq.append(random.choice(other_vowels))
                else:
                    new_seq.append(correct_vowel)

            if new_seq != correct_sequence and new_seq not in distractors:
                distractors.append(new_seq)

        # Fallback if we couldn't generate enough
        while len(distractors) < 4:
            fallback = [(v % NUM_VOWELS) + 1 for v in correct_sequence]
            if fallback not in distractors:
                distractors.append(fallback)
            else:
                distractors.append([(v % NUM_VOWELS) + 1 for v in range(len(correct_sequence))])

        random.shuffle(distractors)
        return distractors

    def get_all_pair_probabilities(self, confusion_state: Optional[VowelConfusionState]) -> list[dict]:
        """Get success probabilities for all 66 vowel pairs."""
        pairs = self.get_all_pairs()
        result = []
        for a, b in pairs:
            prob = self.get_pair_correct_probability(confusion_state, a, b)
            correct = 0
            total = 0
            if confusion_state:
                correct = confusion_state.counts[a][a] + confusion_state.counts[b][b]
                total = (
                    confusion_state.counts[a][a] + confusion_state.counts[a][b] +
                    confusion_state.counts[b][b] + confusion_state.counts[b][a]
                )
            result.append({
                "pair": [a, b],  # 0-indexed
                "probability": prob,
                "correct": correct,
                "total": total,
            })
        return result

    @staticmethod
    def update_confusion_matrix(
        confusion_state: VowelConfusionState,
        correct_sequence: list[int],
        selected_sequence: list[int],
    ) -> VowelConfusionState:
        """Update confusion matrix based on answer. Sequences are 1-indexed."""
        new_counts = [row.copy() for row in confusion_state.counts]
        new_counts_by_context = {
            k: [row.copy() for row in v]
            for k, v in confusion_state.counts_by_context.items()
        }

        syllable_count = len(correct_sequence)
        min_len = min(len(correct_sequence), len(selected_sequence))

        for i in range(min_len):
            correct_idx = correct_sequence[i] - 1  # Convert to 0-indexed
            chosen_idx = selected_sequence[i] - 1
            if 0 <= correct_idx < NUM_VOWELS and 0 <= chosen_idx < NUM_VOWELS:
                # Update global counts
                new_counts[correct_idx][chosen_idx] += 1

                # Update context-specific counts
                key = VowelConfusionState.get_context_key(syllable_count, i)
                if key not in new_counts_by_context:
                    new_counts_by_context[key] = [[0] * NUM_VOWELS for _ in range(NUM_VOWELS)]
                new_counts_by_context[key][correct_idx][chosen_idx] += 1

        return VowelConfusionState(counts=new_counts, counts_by_context=new_counts_by_context)


# Singleton instance
_service: Optional[VowelDrillService] = None


def get_vowel_drill_service() -> VowelDrillService:
    """Get the singleton VowelDrillService instance."""
    global _service
    if _service is None:
        _service = VowelDrillService()
    return _service
