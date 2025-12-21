"""
Tone drill service - handles sampling and state transitions for tone drills.

Ported from frontend/src/hooks/useToneFSRS.ts
"""
import json
import random
from pathlib import Path
from datetime import datetime
from typing import Optional, Literal
from dataclasses import dataclass, field
from pydantic import BaseModel

# Load words data
WORDS_PATH = Path(__file__).parent.parent.parent.parent / "frontend" / "src" / "data" / "words.json"


# Vietnamese tone diacritics mapped to tone IDs (1-indexed)
TONE_MARKS = {
    # Falling (huyền) - grave accent
    'à': 2, 'è': 2, 'ì': 2, 'ò': 2, 'ù': 2, 'ỳ': 2,
    'ằ': 2, 'ầ': 2, 'ề': 2, 'ồ': 2, 'ờ': 2, 'ừ': 2,
    # Rising (sắc) - acute accent
    'á': 3, 'é': 3, 'í': 3, 'ó': 3, 'ú': 3, 'ý': 3,
    'ắ': 3, 'ấ': 3, 'ế': 3, 'ố': 3, 'ớ': 3, 'ứ': 3,
    # Dipping (hỏi) - hook above
    'ả': 4, 'ẻ': 4, 'ỉ': 4, 'ỏ': 4, 'ủ': 4, 'ỷ': 4,
    'ẳ': 4, 'ẩ': 4, 'ể': 4, 'ổ': 4, 'ở': 4, 'ử': 4,
    # Creaky (ngã) - tilde
    'ã': 5, 'ẽ': 5, 'ĩ': 5, 'õ': 5, 'ũ': 5, 'ỹ': 5,
    'ẵ': 5, 'ẫ': 5, 'ễ': 5, 'ỗ': 5, 'ỡ': 5, 'ữ': 5,
    # Heavy (nặng) - dot below
    'ạ': 6, 'ẹ': 6, 'ị': 6, 'ọ': 6, 'ụ': 6, 'ỵ': 6,
    'ặ': 6, 'ậ': 6, 'ệ': 6, 'ộ': 6, 'ợ': 6, 'ự': 6,
}

# Mastery thresholds
PAIR_MASTERY_THRESHOLD = 0.80
FOUR_CHOICE_MASTERY_THRESHOLD = 0.80
MIN_TOTAL_2CHOICE_ATTEMPTS = 100

# Pseudocounts for probability smoothing (Bayesian prior)
# Adds 5 "virtual" correct trials per alternative to avoid extreme probabilities
PSEUDOCOUNT = 5

DifficultyLevel = Literal["2-choice", "4-choice", "multi-syllable"]


class Word(BaseModel):
    id: int
    vietnamese: str
    english: str
    imageUrl: Optional[str] = None


@dataclass
class ConfusionState:
    """6x6 confusion matrix tracking tone confusions.

    Attributes:
        counts: Global 6x6 matrix for all contexts
        counts_by_context: Per-context matrices keyed by "syllable_count-position"
            e.g., "1-0" for 1-syllable position 0, "2-1" for 2-syllable position 1
    """
    counts: list[list[int]] = field(default_factory=lambda: [[0] * 6 for _ in range(6)])
    counts_by_context: dict[str, list[list[int]]] = field(default_factory=dict)

    @staticmethod
    def get_context_key(syllable_count: int, position: int) -> str:
        """Generate context key. Cap syllable_count at 3, position at 2."""
        syl = min(syllable_count, 3)
        pos = min(position, 2)
        return f"{syl}-{pos}"


def detect_tone(syllable: str) -> int:
    """Detect the tone of a Vietnamese syllable (1-indexed)."""
    normalized = syllable.lower().strip()
    for char in normalized:
        if char in TONE_MARKS:
            return TONE_MARKS[char]
    return 1  # Level tone (ngang)


def get_tone_sequence(word: str) -> list[int]:
    """Get the tone sequence for a word (list of 1-indexed tone IDs)."""
    syllables = word.strip().split()
    return [detect_tone(s) for s in syllables if s]


def get_tone_sequence_key(sequence: list[int]) -> str:
    """Create a unique string key for a tone sequence (e.g., '3-2' for Rising→Falling)."""
    return "-".join(str(t) for t in sequence)


class ToneDrillService:
    """Service for tone drill sampling and state management."""

    def __init__(self):
        self._words: list[Word] = []
        self._words_by_sequence: dict[str, list[Word]] = {}
        self._load_words()

    def _load_words(self):
        """Load words from JSON file and index by tone sequence."""
        if WORDS_PATH.exists():
            with open(WORDS_PATH) as f:
                data = json.load(f)
                self._words = [Word(**w) for w in data]

        # Index words by their tone sequence key
        for word in self._words:
            sequence = get_tone_sequence(word.vietnamese)
            key = get_tone_sequence_key(sequence)
            if key not in self._words_by_sequence:
                self._words_by_sequence[key] = []
            self._words_by_sequence[key].append(word)

    def get_all_sequence_keys(self) -> list[str]:
        """Get all sequence keys that have words."""
        return list(self._words_by_sequence.keys())

    @staticmethod
    def get_all_pairs() -> list[tuple[int, int]]:
        """Get all 15 possible pairs of tones (C(6,2) = 15). 0-indexed."""
        pairs = []
        for a in range(6):
            for b in range(a + 1, 6):
                pairs.append((a, b))
        return pairs

    @staticmethod
    def get_all_four_choice_sets() -> list[list[int]]:
        """Get all 15 possible 4-choice sets (C(6,4) = 15). 0-indexed."""
        sets = []
        for exclude1 in range(6):
            for exclude2 in range(exclude1 + 1, 6):
                s = [t for t in range(6) if t != exclude1 and t != exclude2]
                sets.append(s)
        return sets

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
    def get_total_attempts(confusion_state: Optional[ConfusionState]) -> int:
        """Get total attempts from confusion matrix (sum of all cells)."""
        if not confusion_state:
            return 0
        return sum(sum(row) for row in confusion_state.counts)

    @staticmethod
    def get_pair_error_probability(confusion_state: Optional[ConfusionState], a: int, b: int) -> float:
        """
        Calculate P(error) for a 2-choice drill with given alternatives (0-indexed).
        P(error | alternatives={a,b}) = 0.5 * P(error | a played) + 0.5 * P(error | b played)

        Uses pseudocounts (Bayesian smoothing) to avoid extreme probabilities.
        Each alternative gets PSEUDOCOUNT virtual correct trials.
        """
        counts = confusion_state.counts if confusion_state else [[0] * 6 for _ in range(6)]

        # P(error | a played, choices={a,b}) = P(choose b | a played)
        # With pseudocounts: (errors + PSEUDOCOUNT) / (total + 2*PSEUDOCOUNT)
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
    def get_pair_correct_probability(confusion_state: Optional[ConfusionState], a: int, b: int) -> float:
        """Calculate P(correct) for a 2-choice drill with given alternatives."""
        return 1 - ToneDrillService.get_pair_error_probability(confusion_state, a, b)

    @staticmethod
    def get_four_choice_error_probability(confusion_state: Optional[ConfusionState], alternatives: list[int]) -> float:
        """
        Calculate P(error) for a 4-choice drill with given alternatives (0-indexed).
        P(error | alternatives) = (1/4) * sum over t in alternatives of P(error | t played)

        Uses pseudocounts (Bayesian smoothing) to avoid extreme probabilities.
        Each alternative gets PSEUDOCOUNT virtual correct trials.
        """
        if len(alternatives) != 4:
            return 0.75

        counts = confusion_state.counts if confusion_state else [[0] * 6 for _ in range(6)]
        total_error = 0.0

        for tone in alternatives:
            # P(error | tone played) = 1 - P(correct | tone played)
            # With pseudocounts: (correct + PSEUDOCOUNT) / (total + 4*PSEUDOCOUNT)
            sum_counts = sum(counts[tone][alt] for alt in alternatives if tone < len(counts) and alt < len(counts[tone]))
            correct_count = counts[tone][tone] if tone < len(counts) and tone < len(counts[tone]) else 0
            correct_prob = (correct_count + PSEUDOCOUNT) / (sum_counts + 4 * PSEUDOCOUNT)
            total_error += (1 - correct_prob)

        return total_error / 4

    @staticmethod
    def get_four_choice_correct_probability(confusion_state: Optional[ConfusionState], alternatives: list[int]) -> float:
        """Calculate P(correct) for a 4-choice drill with given alternatives."""
        return 1 - ToneDrillService.get_four_choice_error_probability(confusion_state, alternatives)

    @staticmethod
    def are_all_pairs_mastered(confusion_state: Optional[ConfusionState]) -> bool:
        """Check if all 15 tone pairs are mastered (>80% correct probability)."""
        if not confusion_state:
            return False

        total_attempts = ToneDrillService.get_total_attempts(confusion_state)
        if total_attempts < MIN_TOTAL_2CHOICE_ATTEMPTS:
            return False

        all_pairs = ToneDrillService.get_all_pairs()
        for a, b in all_pairs:
            correct_prob = ToneDrillService.get_pair_correct_probability(confusion_state, a, b)
            if correct_prob < PAIR_MASTERY_THRESHOLD:
                return False
        return True

    @staticmethod
    def are_all_four_choice_sets_mastered(confusion_state: Optional[ConfusionState]) -> bool:
        """Check if all 15 four-choice sets are mastered (>80% correct probability)."""
        if not confusion_state:
            return False

        all_sets = ToneDrillService.get_all_four_choice_sets()
        for s in all_sets:
            correct_prob = ToneDrillService.get_four_choice_correct_probability(confusion_state, s)
            if correct_prob < FOUR_CHOICE_MASTERY_THRESHOLD:
                return False
        return True

    @staticmethod
    def get_difficulty_level(confusion_state: Optional[ConfusionState]) -> DifficultyLevel:
        """Determine current difficulty level based on mastery."""
        if not ToneDrillService.are_all_pairs_mastered(confusion_state):
            return "2-choice"
        if not ToneDrillService.are_all_four_choice_sets_mastered(confusion_state):
            return "4-choice"
        return "multi-syllable"

    def get_mono_syllabic_words(self, tone: int) -> list[Word]:
        """Get mono-syllabic words with the given tone (1-indexed)."""
        key = str(tone)
        return self._words_by_sequence.get(key, [])

    def get_any_mono_syllabic_word(self) -> Optional[tuple[Word, str, list[int]]]:
        """Get any mono-syllabic word as fallback. Returns (word, sequenceKey, alternatives)."""
        shuffled_tones = list(range(1, 7))
        random.shuffle(shuffled_tones)

        for tone in shuffled_tones:
            words = self.get_mono_syllabic_words(tone)
            if words:
                word = random.choice(words)
                other_tone = tone + 1 if tone < 6 else tone - 1
                # Return 0-indexed alternatives
                return (word, str(tone), [tone - 1, other_tone - 1])
        return None

    def get_any_word(self) -> Optional[tuple[Word, str]]:
        """Get any word as last resort fallback."""
        for key, words in self._words_by_sequence.items():
            if words:
                return (random.choice(words), key)
        return None

    def sample_next_drill(
        self,
        confusion_state: Optional[ConfusionState],
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
            # multi-syllable is max level, no preview

        if difficulty == "2-choice":
            return self._sample_2_choice(confusion_state)
        elif difficulty == "4-choice":
            return self._sample_4_choice(confusion_state)
        else:
            return self._sample_multi_syllable(confusion_state)

    def _sample_2_choice(self, confusion_state: Optional[ConfusionState]) -> Optional[dict]:
        """Sample a 2-choice drill weighted by error probability."""
        all_pairs = self.get_all_pairs()
        error_probs = [self.get_pair_error_probability(confusion_state, a, b) for a, b in all_pairs]
        selected_pair_idx = self.weighted_sample(error_probs)
        selected_pair = all_pairs[selected_pair_idx]

        # Sample tone uniformly from the pair (0-indexed)
        selected_tone_idx = 0 if random.random() < 0.5 else 1
        selected_tone = selected_pair[selected_tone_idx]  # 0-indexed

        # Find mono-syllabic words with this tone (tone is 0-indexed, sequence key is 1-indexed)
        words = self.get_mono_syllabic_words(selected_tone + 1)

        if not words:
            # Try the other tone in the pair
            other_tone = selected_pair[1 - selected_tone_idx]
            words = self.get_mono_syllabic_words(other_tone + 1)
            if words:
                selected_tone = other_tone

        if not words:
            # Fallback
            fallback = self.get_any_mono_syllabic_word()
            if fallback:
                word, seq_key, alts = fallback
                return {
                    "word": word,
                    "sequence_key": seq_key,
                    "correct_sequence": [int(t) for t in seq_key.split("-")],
                    "alternatives": [[a + 1] for a in alts],  # Convert to 1-indexed sequences
                }
            return None

        word = random.choice(words)
        sequence_key = str(selected_tone + 1)  # 1-indexed
        correct_sequence = [selected_tone + 1]  # 1-indexed

        # Alternatives are the pair tones as sequences (1-indexed)
        alternatives = [[selected_pair[0] + 1], [selected_pair[1] + 1]]

        return {
            "word": word,
            "sequence_key": sequence_key,
            "correct_sequence": correct_sequence,
            "alternatives": alternatives,
        }

    def _sample_4_choice(self, confusion_state: Optional[ConfusionState]) -> Optional[dict]:
        """Sample a 4-choice drill weighted by error probability."""
        all_sets = self.get_all_four_choice_sets()
        error_probs = [self.get_four_choice_error_probability(confusion_state, s) for s in all_sets]
        selected_set_idx = self.weighted_sample(error_probs)
        selected_set = all_sets[selected_set_idx]  # 0-indexed

        # Shuffle to try tones in random order
        shuffled_indices = list(range(4))
        random.shuffle(shuffled_indices)

        word = None
        selected_tone = None

        for idx in shuffled_indices:
            tone = selected_set[idx]  # 0-indexed
            words = self.get_mono_syllabic_words(tone + 1)  # 1-indexed for lookup
            if words:
                word = random.choice(words)
                selected_tone = tone
                break

        if not word:
            # Fallback
            fallback = self.get_any_mono_syllabic_word()
            if fallback:
                word, seq_key, _ = fallback
                # Use the selected 4-choice set as alternatives
                return {
                    "word": word,
                    "sequence_key": seq_key,
                    "correct_sequence": [int(t) for t in seq_key.split("-")],
                    "alternatives": [[t + 1] for t in selected_set],  # 1-indexed
                }
            return None

        sequence_key = str(selected_tone + 1)  # 1-indexed
        correct_sequence = [selected_tone + 1]  # 1-indexed
        alternatives = [[t + 1] for t in selected_set]  # 1-indexed

        return {
            "word": word,
            "sequence_key": sequence_key,
            "correct_sequence": correct_sequence,
            "alternatives": alternatives,
        }

    def _sample_2_syllable(self, confusion_state: Optional[ConfusionState]) -> Optional[dict]:
        """Sample a 2-syllable drill with per-position pair alternatives (2x2=4)."""
        # Get all 2-syllable sequence keys
        two_syllable_keys = [k for k in self.get_all_sequence_keys()
                             if len(k.split('-')) == 2]

        if not two_syllable_keys:
            return self._sample_multi_syllable(confusion_state)  # Fallback

        # Step 1: Sample first position pair (weighted by error prob)
        all_pairs = self.get_all_pairs()
        error_probs_1 = [self.get_pair_error_probability(confusion_state, a, b)
                         for a, b in all_pairs]
        pair1_idx = self.weighted_sample(error_probs_1)
        pair1 = all_pairs[pair1_idx]  # 0-indexed

        # Step 2: Sample second position pair
        error_probs_2 = [self.get_pair_error_probability(confusion_state, a, b)
                         for a, b in all_pairs]
        pair2_idx = self.weighted_sample(error_probs_2)
        pair2 = all_pairs[pair2_idx]  # 0-indexed

        # Step 3: Sample target tone from each pair
        tone1 = pair1[0 if random.random() < 0.5 else 1]
        tone2 = pair2[0 if random.random() < 0.5 else 1]
        target_key = f"{tone1 + 1}-{tone2 + 1}"  # 1-indexed

        # Step 4: Find word with this sequence (or closest match)
        words = self._words_by_sequence.get(target_key, [])
        if not words:
            # Try any 2-syllable word with tones from the pairs
            for t1 in pair1:
                for t2 in pair2:
                    key = f"{t1 + 1}-{t2 + 1}"
                    words = self._words_by_sequence.get(key, [])
                    if words:
                        target_key = key
                        tone1, tone2 = t1, t2
                        break
                if words:
                    break

        if not words:
            # Fallback: any 2-syllable word, use its tones to form pairs
            for key in two_syllable_keys:
                words = self._words_by_sequence.get(key, [])
                if words:
                    target_key = key
                    tones = [int(t) - 1 for t in key.split('-')]  # 0-indexed
                    tone1, tone2 = tones[0], tones[1]
                    # Form pairs around these tones
                    pair1 = (tone1, (tone1 + 1) % 6)
                    pair2 = (tone2, (tone2 + 1) % 6)
                    break

        if not words:
            return self._sample_multi_syllable(confusion_state)

        word = random.choice(words)
        correct_sequence = [int(t) for t in target_key.split('-')]  # 1-indexed

        # Step 5: Build 4 alternatives (2x2 combinations, 1-indexed)
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

    def _sample_multi_syllable(self, confusion_state: Optional[ConfusionState]) -> Optional[dict]:
        """Sample a multi-syllable drill using priority scoring."""
        # For multi-syllable mode, sample from all words with priority scoring
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
                correct_sequence = [int(t) for t in key.split("-")]
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
        correct_sequence = [int(t) for t in selected_key.split("-")]
        alternatives = self._generate_distractors(correct_sequence)

        return {
            "word": word,
            "sequence_key": selected_key,
            "correct_sequence": correct_sequence,
            "alternatives": alternatives,
        }

    def _calculate_priority_score(self, sequence_key: str, confusion_state: Optional[ConfusionState]) -> float:
        """Calculate priority score for a tone sequence."""
        syllable_count = len(sequence_key.split("-"))

        # Syllable penalty: prefer shorter sequences
        syllable_penalty = {1: 1.0, 2: 0.5, 3: 0.25}.get(syllable_count, 0.1)

        # Confusion factor
        confusion_factor = self._get_confusion_factor(sequence_key, confusion_state)
        error_prob = confusion_factor - 1.0  # Range [0.0, 1.0]
        confusion_priority = 0.5 + error_prob

        return syllable_penalty * confusion_priority

    def _get_confusion_factor(self, sequence_key: str, confusion_state: Optional[ConfusionState]) -> float:
        """Calculate confusion-based difficulty factor. Returns >= 1.0."""
        if not confusion_state:
            return 1.0

        tone_numbers = [int(t) for t in sequence_key.split("-")]
        total_confusion = 0.0

        for tone_num in tone_numbers:
            tone_idx = tone_num - 1
            if 0 <= tone_idx < len(confusion_state.counts):
                row = confusion_state.counts[tone_idx]
                row_sum = sum(row)
                if row_sum > 0:
                    correct_prob = row[tone_idx] / row_sum
                    total_confusion += 1 + (1 - correct_prob)
                else:
                    total_confusion += 1.0
            else:
                total_confusion += 1.0

        return total_confusion / len(tone_numbers)

    def _generate_distractors(self, correct_sequence: list[int]) -> list[list[int]]:
        """Generate distractor sequences for multi-syllable mode. Returns 4 alternatives including correct."""
        all_tones = [1, 2, 3, 4, 5, 6]
        distractors = [correct_sequence]  # Include correct
        max_attempts = 100
        attempts = 0

        while len(distractors) < 4 and attempts < max_attempts:
            attempts += 1
            # Generate a random sequence of same length
            new_seq = []
            for i, correct_tone in enumerate(correct_sequence):
                # 70% chance to change this position
                if random.random() < 0.7:
                    other_tones = [t for t in all_tones if t != correct_tone]
                    new_seq.append(random.choice(other_tones))
                else:
                    new_seq.append(correct_tone)

            # Check uniqueness
            if new_seq != correct_sequence and new_seq not in distractors:
                distractors.append(new_seq)

        # Fallback if we couldn't generate enough
        while len(distractors) < 4:
            fallback = [(t % 6) + 1 for t in correct_sequence]
            if fallback not in distractors:
                distractors.append(fallback)
            else:
                # Just add something different
                distractors.append([(t % 6) + 1 for t in range(len(correct_sequence))])

        random.shuffle(distractors)
        return distractors

    def get_all_pair_probabilities(self, confusion_state: Optional[ConfusionState]) -> list[dict]:
        """Get success probabilities for all 15 tone pairs."""
        pairs = self.get_all_pairs()
        result = []
        for a, b in pairs:
            prob = self.get_pair_correct_probability(confusion_state, a, b)
            # Calculate correct and total attempts for both directions
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

    def get_all_four_choice_probabilities(self, confusion_state: Optional[ConfusionState]) -> list[dict]:
        """Get success probabilities for all 15 four-choice sets."""
        sets = self.get_all_four_choice_sets()
        result = []
        for s in sets:
            prob = self.get_four_choice_correct_probability(confusion_state, s)
            result.append({
                "set": s,  # 0-indexed
                "probability": prob,
            })
        return result

    @staticmethod
    def update_confusion_matrix(
        confusion_state: ConfusionState,
        correct_sequence: list[int],
        selected_sequence: list[int],
    ) -> ConfusionState:
        """Update confusion matrix based on answer. Sequences are 1-indexed.

        Updates both global counts and context-specific counts keyed by
        syllable_count and position.
        """
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
            if 0 <= correct_idx < 6 and 0 <= chosen_idx < 6:
                # Update global counts
                new_counts[correct_idx][chosen_idx] += 1

                # Update context-specific counts
                key = ConfusionState.get_context_key(syllable_count, i)
                if key not in new_counts_by_context:
                    new_counts_by_context[key] = [[0] * 6 for _ in range(6)]
                new_counts_by_context[key][correct_idx][chosen_idx] += 1

        return ConfusionState(counts=new_counts, counts_by_context=new_counts_by_context)


# Singleton instance
_service: Optional[ToneDrillService] = None


def get_tone_drill_service() -> ToneDrillService:
    """Get the singleton ToneDrillService instance."""
    global _service
    if _service is None:
        _service = ToneDrillService()
    return _service
