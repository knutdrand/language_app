"""
Tone drill service - handles sampling and orchestration for tone drills.

Uses the ML layer for all probability calculations and state updates.
"""

from __future__ import annotations

import json
import random
from pathlib import Path
from typing import Optional, Literal

from pydantic import BaseModel

from app.ml import (
    Problem,
    Answer,
    StateUpdate,
    ConfusionState,
    BetaParams,
    get_ml_service,
    make_problem_type_id,
)

# Load words data
WORDS_PATH = Path(__file__).parent.parent.parent.parent / "frontend" / "src" / "data" / "words.json"

# Mastery thresholds (main logic owns these)
PAIR_MASTERY_THRESHOLD = 0.80  # Required to progress from 2-choice to 4-choice
FOUR_CHOICE_MASTERY_THRESHOLD = 0.90  # Required to progress from 4-choice to multi-syllable

# Preview probability for next difficulty level
PREVIEW_PROBABILITY = 0.2

# Number of tone classes (6 Vietnamese tones)
N_TONES = 6

DifficultyLevel = Literal["2-choice", "mixed", "4-choice-multi"]


# Vietnamese tone diacritics mapped to tone IDs (1-indexed)
TONE_MARKS = {
    'à': 2, 'è': 2, 'ì': 2, 'ò': 2, 'ù': 2, 'ỳ': 2,
    'ằ': 2, 'ầ': 2, 'ề': 2, 'ồ': 2, 'ờ': 2, 'ừ': 2,
    'á': 3, 'é': 3, 'í': 3, 'ó': 3, 'ú': 3, 'ý': 3,
    'ắ': 3, 'ấ': 3, 'ế': 3, 'ố': 3, 'ớ': 3, 'ứ': 3,
    'ả': 4, 'ẻ': 4, 'ỉ': 4, 'ỏ': 4, 'ủ': 4, 'ỷ': 4,
    'ẳ': 4, 'ẩ': 4, 'ể': 4, 'ổ': 4, 'ở': 4, 'ử': 4,
    'ã': 5, 'ẽ': 5, 'ĩ': 5, 'õ': 5, 'ũ': 5, 'ỹ': 5,
    'ẵ': 5, 'ẫ': 5, 'ễ': 5, 'ỗ': 5, 'ỡ': 5, 'ữ': 5,
    'ạ': 6, 'ẹ': 6, 'ị': 6, 'ọ': 6, 'ụ': 6, 'ỵ': 6,
    'ặ': 6, 'ậ': 6, 'ệ': 6, 'ộ': 6, 'ợ': 6, 'ự': 6,
}

# Sampling aggressiveness: higher = focus more on problematic pairs
# 1.0 = linear, 2.0 = squared, 3.0 = cubed
SAMPLING_AGGRESSIVENESS = 3.0


class Word(BaseModel):
    id: int
    vietnamese: str
    english: str
    imageUrl: Optional[str] = None


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


class DrillService:
    """Service for tone drill sampling and orchestration.

    Uses the ML layer for probability calculations and state updates.
    Main logic layer responsibilities:
    - Word loading and indexing
    - Difficulty level determination (using ML probabilities)
    - Drill sampling
    """

    def __init__(self):
        self.ml = get_ml_service()
        self._words: list[Word] = []
        self._words_by_sequence: dict[str, list[Word]] = {}
        self._load_words()

    def _load_words(self):
        """Load words from JSON file and index by tone sequence."""
        if WORDS_PATH.exists():
            with open(WORDS_PATH) as f:
                data = json.load(f)
                self._words = [Word(**w) for w in data]

        for word in self._words:
            sequence = get_tone_sequence(word.vietnamese)
            key = "-".join(str(t) for t in sequence)
            if key not in self._words_by_sequence:
                self._words_by_sequence[key] = []
            self._words_by_sequence[key].append(word)

    def process_answer_and_get_next(
        self,
        problem: Optional[Problem],
        answer: Optional[Answer],
        states: dict[str, ConfusionState],
    ) -> tuple[Problem, dict[str, ConfusionState], list[StateUpdate]]:
        """Process answer and get next problem.

        Args:
            problem: Previous problem (None if first drill)
            answer: User's answer (None if first drill)
            states: Dict of problem_type_id -> ConfusionState

        Returns:
            (next_problem, updated_states, state_updates)
        """
        all_updates: list[StateUpdate] = []

        # Update state if answer provided
        if problem and answer:
            problem_type_id = problem.problem_type_id
            state = states.get(problem_type_id)
            if state is None:
                state = self.ml.get_initial_state(problem_type_id)

            new_state, updates = self.ml.update_state(state, problem, answer)
            states[problem_type_id] = new_state
            all_updates.extend(updates)

        # Determine difficulty level for single-syllable
        state_1 = states.get(make_problem_type_id("tone", 1))
        if state_1 is None:
            state_1 = self.ml.get_initial_state(make_problem_type_id("tone", 1))

        difficulty = self._get_difficulty_level(state_1)

        # Sample next problem
        next_problem = self._sample_problem(difficulty, states)

        return next_problem, states, all_updates

    def _get_difficulty_level(self, state: ConfusionState) -> DifficultyLevel:
        """Determine current difficulty level based on mastery.

        Uses ML layer to get probabilities, applies thresholds here.

        Progression:
        1. 2-choice (1-syllable) → exit when 80% all pairs
        2. mixed (4-choice 1-syl + 2-choice 2-syl) → exit when 90% on 4-choice sets
        3. 4-choice-multi (4-choice 2-syllable)
        """
        problem_type_id = make_problem_type_id("tone", 1)

        # Check pair mastery (2-choice)
        pair_stats = self.ml.get_all_pair_stats(problem_type_id, state)
        for (a, b), beta in pair_stats.items():
            if beta.mean < PAIR_MASTERY_THRESHOLD:
                return "2-choice"

        # Check four-choice mastery using actual 4-choice success probability
        all_sets = self._get_all_four_choice_sets()
        for s in all_sets:
            # For each class in the set, compute 4-choice success probability
            for correct_class in s:
                dummy_problem = Problem(
                    problem_type_id=problem_type_id,
                    word_id=0,
                    vietnamese="",
                    english="",
                    correct_index=0,
                    correct_sequence=[correct_class],
                    alternatives=[[c] for c in s],
                )
                beta = self.ml.get_success_distribution(dummy_problem, state)
                if beta.mean < FOUR_CHOICE_MASTERY_THRESHOLD:
                    return "mixed"

        return "4-choice-multi"

    def _get_total_attempts(self, state: ConfusionState) -> int:
        """Get total attempts from confusion matrix."""
        # Sum all counts and subtract prior
        total = sum(sum(row) for row in state.counts)
        # Subtract initial prior
        initial = self.ml.get_initial_state(make_problem_type_id("tone", 1))
        initial_total = sum(sum(row) for row in initial.counts)
        return int(total - initial_total)

    def _get_all_pairs(self) -> list[tuple[int, int]]:
        """Get all pairs of tone classes. Returns 1-indexed."""
        pairs = []
        for a in range(1, N_TONES + 1):
            for b in range(a + 1, N_TONES + 1):
                pairs.append((a, b))
        return pairs

    def _get_all_four_choice_sets(self) -> list[list[int]]:
        """Get all possible 4-choice sets. Returns 1-indexed.

        Returns all 15 sets (6 choose 4) for 6 tones.
        """
        sets = []
        for exclude1 in range(1, N_TONES + 1):
            for exclude2 in range(exclude1 + 1, N_TONES + 1):
                s = [t for t in range(1, N_TONES + 1) if t != exclude1 and t != exclude2]
                sets.append(s)
        return sets

    def get_four_choice_stats(
        self, state: ConfusionState
    ) -> list[dict]:
        """Get success probability stats for all 4-choice sets.

        Returns a list of dicts with:
        - set: list of 4 class IDs (1-indexed)
        - alpha: Beta distribution alpha
        - beta: Beta distribution beta
        - mean: mean success probability
        """
        problem_type_id = make_problem_type_id("tone", 1)
        all_sets = self._get_all_four_choice_sets()

        if not all_sets:
            return []

        results = []
        for s in all_sets:
            # Compute average success probability across all classes in the set
            total_alpha = 0.0
            total_beta = 0.0
            for correct_class in s:
                dummy_problem = Problem(
                    problem_type_id=problem_type_id,
                    word_id=0,
                    vietnamese="",
                    english="",
                    correct_index=0,
                    correct_sequence=[correct_class],
                    alternatives=[[c] for c in s],
                )
                beta_params = self.ml.get_success_distribution(dummy_problem, state)
                total_alpha += beta_params.alpha
                total_beta += beta_params.beta

            # Average the alpha/beta values
            avg_alpha = total_alpha / len(s)
            avg_beta = total_beta / len(s)

            results.append({
                "set": s,
                "alpha": avg_alpha,
                "beta": avg_beta,
                "mean": avg_alpha / (avg_alpha + avg_beta),
            })

        return results

    def _sample_problem(
        self,
        difficulty: DifficultyLevel,
        states: dict[str, ConfusionState],
    ) -> Problem:
        """Sample the next problem based on difficulty level."""
        # 20% preview of next level
        if random.random() < PREVIEW_PROBABILITY:
            if difficulty == "2-choice":
                # Preview mixed level (either 4-choice 1-syl or 2-choice 2-syl)
                if random.random() < 0.5:
                    problem = self._sample_4_choice(states)
                else:
                    problem = self._sample_2_choice_multi_syllable(states)
                if problem:
                    return problem
            elif difficulty == "mixed":
                # Preview 4-choice multi-syllable
                problem = self._sample_4_choice_multi_syllable(states)
                if problem:
                    return problem

        if difficulty == "2-choice":
            problem = self._sample_2_choice(states)
        elif difficulty == "mixed":
            # 50/50 between 4-choice 1-syllable and 2-choice 2-syllable
            if random.random() < 0.5:
                problem = self._sample_4_choice(states)
            else:
                problem = self._sample_2_choice_multi_syllable(states)
        else:  # 4-choice-multi
            problem = self._sample_4_choice_multi_syllable(states)

        if problem:
            return problem

        # Fallback
        return self._sample_fallback()

    def _sample_2_choice(self, states: dict[str, ConfusionState]) -> Optional[Problem]:
        """Sample a 2-choice drill weighted by error probability."""
        problem_type_id = make_problem_type_id("tone", 1)
        state = states.get(problem_type_id)
        if state is None:
            state = self.ml.get_initial_state(problem_type_id)

        pair_stats = self.ml.get_all_pair_stats(problem_type_id, state)
        pairs = list(pair_stats.keys())

        # Weight by error probability (aggressive: raise to power)
        error_probs = []
        for p in pairs:
            if p in pair_stats:
                error = 1 - pair_stats[p].mean
            else:
                error = 0.5  # Default for new pairs
            # Raise to power for more aggressive focus on problematic pairs
            error_probs.append(error ** SAMPLING_AGGRESSIVENESS)

        selected_pair = pairs[self._weighted_sample(error_probs)]

        # Sample class from pair
        selected_class = selected_pair[0] if random.random() < 0.5 else selected_pair[1]

        # Find word
        words = self._words_by_sequence.get(str(selected_class), [])
        if not words:
            # Try other class
            other_class = selected_pair[1] if selected_class == selected_pair[0] else selected_pair[0]
            words = self._words_by_sequence.get(str(other_class), [])
            if words:
                selected_class = other_class

        if not words:
            return None

        word = random.choice(words)

        return Problem(
            problem_type_id=problem_type_id,
            word_id=word.id,
            vietnamese=word.vietnamese,
            english=word.english,
            correct_index=0,
            correct_sequence=[selected_class],
            alternatives=[[selected_pair[0]], [selected_pair[1]]],
        )

    def _sample_4_choice(self, states: dict[str, ConfusionState]) -> Optional[Problem]:
        """Sample a 4-choice drill."""
        problem_type_id = make_problem_type_id("tone", 1)
        state = states.get(problem_type_id)
        if state is None:
            state = self.ml.get_initial_state(problem_type_id)

        pair_stats = self.ml.get_all_pair_stats(problem_type_id, state)
        all_sets = self._get_all_four_choice_sets()

        # Use predefined sets weighted by error probability
        error_probs = []
        for s in all_sets:
            total_error = 0
            count = 0
            for i, a in enumerate(s):
                for b in s[i+1:]:
                    pair_key = (min(a, b), max(a, b))
                    if pair_key in pair_stats:
                        total_error += 1 - pair_stats[pair_key].mean
                        count += 1
            error_probs.append(total_error / max(count, 1))
        selected_set = all_sets[self._weighted_sample(error_probs)]

        # Find word with tone class from this set
        random.shuffle(selected_set)
        for cls in selected_set:
            words = self._words_by_sequence.get(str(cls), [])
            if words:
                word = random.choice(words)
                return Problem(
                    problem_type_id=problem_type_id,
                    word_id=word.id,
                    vietnamese=word.vietnamese,
                    english=word.english,
                    correct_index=0,
                    correct_sequence=[cls],
                    alternatives=[[c] for c in selected_set],
                )

        return None

    def _sample_2_choice_multi_syllable(
        self, states: dict[str, ConfusionState]
    ) -> Optional[Problem]:
        """Sample a 2-choice multi-syllable drill (2 alternatives)."""
        # Get 2-syllable words
        two_syllable_keys = [k for k in self._words_by_sequence.keys()
                           if len(k.split('-')) == 2]

        if not two_syllable_keys:
            return None

        problem_type_id = make_problem_type_id("tone", 2)
        state = states.get(problem_type_id)
        if state is None:
            state = self.ml.get_initial_state(problem_type_id)

        # Simple random for now
        key = random.choice(two_syllable_keys)
        words = self._words_by_sequence.get(key, [])
        if not words:
            return None

        word = random.choice(words)
        correct_sequence = [int(t) for t in key.split('-')]

        # Generate just 1 distractor (2-choice)
        distractor = self._generate_single_distractor(correct_sequence)
        alternatives = [correct_sequence, distractor]
        random.shuffle(alternatives)

        return Problem(
            problem_type_id=problem_type_id,
            word_id=word.id,
            vietnamese=word.vietnamese,
            english=word.english,
            correct_index=0,
            correct_sequence=correct_sequence,
            alternatives=alternatives,
        )

    def _sample_4_choice_multi_syllable(
        self, states: dict[str, ConfusionState]
    ) -> Optional[Problem]:
        """Sample a 4-choice multi-syllable drill (4 alternatives)."""
        # Get 2-syllable words
        two_syllable_keys = [k for k in self._words_by_sequence.keys()
                           if len(k.split('-')) == 2]

        if not two_syllable_keys:
            return None

        problem_type_id = make_problem_type_id("tone", 2)
        state = states.get(problem_type_id)
        if state is None:
            state = self.ml.get_initial_state(problem_type_id)

        # Simple random for now
        key = random.choice(two_syllable_keys)
        words = self._words_by_sequence.get(key, [])
        if not words:
            return None

        word = random.choice(words)
        correct_sequence = [int(t) for t in key.split('-')]
        alternatives = self._generate_distractors(correct_sequence)

        return Problem(
            problem_type_id=problem_type_id,
            word_id=word.id,
            vietnamese=word.vietnamese,
            english=word.english,
            correct_index=0,
            correct_sequence=correct_sequence,
            alternatives=alternatives,
        )

    def _sample_fallback(self) -> Problem:
        """Sample any word as fallback."""
        for key, words in self._words_by_sequence.items():
            if words:
                word = random.choice(words)
                correct_sequence = [int(t) for t in key.split('-')]
                problem_type_id = make_problem_type_id("tone", len(correct_sequence))
                alternatives = self._generate_distractors(correct_sequence)
                return Problem(
                    problem_type_id=problem_type_id,
                    word_id=word.id,
                    vietnamese=word.vietnamese,
                    english=word.english,
                    correct_index=0,
                    correct_sequence=correct_sequence,
                    alternatives=alternatives,
                )

        # Absolute fallback
        return Problem(
            problem_type_id=make_problem_type_id("tone", 1),
            word_id=0,
            vietnamese="xin chào",
            english="hello",
            correct_index=0,
            correct_sequence=[1],
            alternatives=[[1], [2]],
        )

    def _generate_distractors(self, correct_sequence: list[int]) -> list[list[int]]:
        """Generate distractor sequences."""
        all_classes = list(range(1, N_TONES + 1))
        distractors = [correct_sequence]

        for _ in range(50):
            if len(distractors) >= 4:
                break
            new_seq = []
            for correct_cls in correct_sequence:
                if random.random() < 0.7:
                    other_classes = [c for c in all_classes if c != correct_cls]
                    new_seq.append(random.choice(other_classes))
                else:
                    new_seq.append(correct_cls)
            if new_seq != correct_sequence and new_seq not in distractors:
                distractors.append(new_seq)

        while len(distractors) < 4:
            fallback = [(c % N_TONES) + 1 for c in correct_sequence]
            if fallback not in distractors:
                distractors.append(fallback)
            else:
                distractors.append([(i % N_TONES) + 1 for i in range(len(correct_sequence))])

        random.shuffle(distractors)
        return distractors

    def _generate_single_distractor(self, correct_sequence: list[int]) -> list[int]:
        """Generate a single distractor sequence (for 2-choice)."""
        all_classes = list(range(1, N_TONES + 1))

        for _ in range(50):
            new_seq = []
            for correct_cls in correct_sequence:
                if random.random() < 0.7:
                    other_classes = [c for c in all_classes if c != correct_cls]
                    new_seq.append(random.choice(other_classes))
                else:
                    new_seq.append(correct_cls)
            if new_seq != correct_sequence:
                return new_seq

        # Fallback: change first syllable
        distractor = correct_sequence.copy()
        distractor[0] = (distractor[0] % N_TONES) + 1
        return distractor

    @staticmethod
    def _weighted_sample(weights: list[float]) -> int:
        """Sample an index proportional to weights."""
        total = sum(weights)
        if total == 0:
            return random.randint(0, len(weights) - 1)

        r = random.random() * total
        for i, w in enumerate(weights):
            r -= w
            if r <= 0:
                return i
        return len(weights) - 1


# Singleton instance
_tone_service: Optional[DrillService] = None


def get_drill_service(drill_type: str = "tone") -> DrillService:
    """Get the singleton DrillService."""
    global _tone_service

    if _tone_service is None:
        _tone_service = DrillService()
    return _tone_service
