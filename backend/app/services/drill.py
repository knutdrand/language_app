"""
Unified drill service - handles sampling and orchestration for all drill types.

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
PAIR_MASTERY_THRESHOLD = 0.80
FOUR_CHOICE_MASTERY_THRESHOLD = 0.80
MIN_TOTAL_ATTEMPTS = 100

# Preview probability for next difficulty level
PREVIEW_PROBABILITY = 0.2

DifficultyLevel = Literal["2-choice", "4-choice", "multi-syllable"]


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
    """Service for drill sampling and orchestration.

    Uses the ML layer for probability calculations and state updates.
    Main logic layer responsibilities:
    - Word loading and indexing
    - Difficulty level determination (using ML probabilities)
    - Drill sampling
    """

    def __init__(self, drill_type: Literal["tone", "vowel"] = "tone"):
        self.drill_type = drill_type
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
        state_1 = states.get(make_problem_type_id(self.drill_type, 1))
        if state_1 is None:
            state_1 = self.ml.get_initial_state(make_problem_type_id(self.drill_type, 1))

        difficulty = self._get_difficulty_level(state_1)

        # Sample next problem
        next_problem = self._sample_problem(difficulty, states)

        return next_problem, states, all_updates

    def _get_difficulty_level(self, state: ConfusionState) -> DifficultyLevel:
        """Determine current difficulty level based on mastery.

        Uses ML layer to get probabilities, applies thresholds here.
        """
        problem_type_id = make_problem_type_id(self.drill_type, 1)

        # Check if we have enough attempts
        total_attempts = self._get_total_attempts(state)
        if total_attempts < MIN_TOTAL_ATTEMPTS:
            return "2-choice"

        # Check pair mastery
        pair_stats = self.ml.get_all_pair_stats(problem_type_id, state)
        for (a, b), beta in pair_stats.items():
            if beta.mean < PAIR_MASTERY_THRESHOLD:
                return "2-choice"

        # Check four-choice mastery (approximation using pair stats)
        # A four-choice set is mastered if all component pairs are mastered
        all_sets = self._get_all_four_choice_sets()
        for s in all_sets:
            # Check all pairs within this set
            set_mastered = True
            for i, a in enumerate(s):
                for b in s[i+1:]:
                    pair_key = (min(a, b), max(a, b))
                    if pair_key in pair_stats:
                        if pair_stats[pair_key].mean < FOUR_CHOICE_MASTERY_THRESHOLD:
                            set_mastered = False
                            break
                if not set_mastered:
                    break
            if not set_mastered:
                return "4-choice"

        return "multi-syllable"

    def _get_total_attempts(self, state: ConfusionState) -> int:
        """Get total attempts from confusion matrix."""
        # Sum all counts and subtract prior
        total = sum(sum(row) for row in state.counts)
        # Subtract initial prior (n_classes * n_classes * pseudocount * 3 for diagonal bias)
        initial = self.ml.get_initial_state(make_problem_type_id(self.drill_type, 1))
        initial_total = sum(sum(row) for row in initial.counts)
        return int(total - initial_total)

    @staticmethod
    def _get_all_pairs() -> list[tuple[int, int]]:
        """Get all pairs of classes. Returns 1-indexed."""
        pairs = []
        for a in range(1, 7):
            for b in range(a + 1, 7):
                pairs.append((a, b))
        return pairs

    @staticmethod
    def _get_all_four_choice_sets() -> list[list[int]]:
        """Get all 15 possible 4-choice sets. Returns 1-indexed."""
        sets = []
        for exclude1 in range(1, 7):
            for exclude2 in range(exclude1 + 1, 7):
                s = [t for t in range(1, 7) if t != exclude1 and t != exclude2]
                sets.append(s)
        return sets

    def _sample_problem(
        self,
        difficulty: DifficultyLevel,
        states: dict[str, ConfusionState],
    ) -> Problem:
        """Sample the next problem based on difficulty level."""
        # 20% preview of next level
        if random.random() < PREVIEW_PROBABILITY:
            if difficulty == "2-choice":
                problem = self._sample_4_choice(states)
                if problem:
                    return problem
            elif difficulty == "4-choice":
                problem = self._sample_multi_syllable(states)
                if problem:
                    return problem

        if difficulty == "2-choice":
            problem = self._sample_2_choice(states)
        elif difficulty == "4-choice":
            problem = self._sample_4_choice(states)
        else:
            problem = self._sample_multi_syllable(states)

        if problem:
            return problem

        # Fallback
        return self._sample_fallback()

    def _sample_2_choice(self, states: dict[str, ConfusionState]) -> Optional[Problem]:
        """Sample a 2-choice drill weighted by error probability."""
        problem_type_id = make_problem_type_id(self.drill_type, 1)
        state = states.get(problem_type_id)
        if state is None:
            state = self.ml.get_initial_state(problem_type_id)

        # Get pair stats and weight by error probability
        pair_stats = self.ml.get_all_pair_stats(problem_type_id, state)
        pairs = list(pair_stats.keys())
        error_probs = [1 - pair_stats[p].mean for p in pairs]

        selected_pair = pairs[self._weighted_sample(error_probs)]

        # Sample tone from pair
        selected_tone = selected_pair[0] if random.random() < 0.5 else selected_pair[1]

        # Find word
        words = self._words_by_sequence.get(str(selected_tone), [])
        if not words:
            # Try other tone
            other_tone = selected_pair[1] if selected_tone == selected_pair[0] else selected_pair[0]
            words = self._words_by_sequence.get(str(other_tone), [])
            if words:
                selected_tone = other_tone

        if not words:
            return None

        word = random.choice(words)

        return Problem(
            problem_type_id=problem_type_id,
            word_id=word.id,
            vietnamese=word.vietnamese,
            correct_index=0,
            correct_sequence=[selected_tone],
            alternatives=[[selected_pair[0]], [selected_pair[1]]],
        )

    def _sample_4_choice(self, states: dict[str, ConfusionState]) -> Optional[Problem]:
        """Sample a 4-choice drill."""
        problem_type_id = make_problem_type_id(self.drill_type, 1)
        state = states.get(problem_type_id)
        if state is None:
            state = self.ml.get_initial_state(problem_type_id)

        # Get all 4-choice sets and calculate error probability for each
        all_sets = self._get_all_four_choice_sets()
        pair_stats = self.ml.get_all_pair_stats(problem_type_id, state)

        error_probs = []
        for s in all_sets:
            # Average error probability across all pairs in set
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

        # Find word with tone from this set
        random.shuffle(selected_set)
        for tone in selected_set:
            words = self._words_by_sequence.get(str(tone), [])
            if words:
                word = random.choice(words)
                return Problem(
                    problem_type_id=problem_type_id,
                    word_id=word.id,
                    vietnamese=word.vietnamese,
                    correct_index=0,
                    correct_sequence=[tone],
                    alternatives=[[t] for t in selected_set],
                )

        return None

    def _sample_multi_syllable(self, states: dict[str, ConfusionState]) -> Optional[Problem]:
        """Sample a multi-syllable drill."""
        # Get 2-syllable words
        two_syllable_keys = [k for k in self._words_by_sequence.keys()
                           if len(k.split('-')) == 2]

        if not two_syllable_keys:
            return None

        # Sample weighted by confusion
        problem_type_id = make_problem_type_id(self.drill_type, 2)
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
                problem_type_id = make_problem_type_id(self.drill_type, len(correct_sequence))
                alternatives = self._generate_distractors(correct_sequence)
                return Problem(
                    problem_type_id=problem_type_id,
                    word_id=word.id,
                    vietnamese=word.vietnamese,
                    correct_index=0,
                    correct_sequence=correct_sequence,
                    alternatives=alternatives,
                )

        # Absolute fallback
        return Problem(
            problem_type_id=make_problem_type_id(self.drill_type, 1),
            word_id=0,
            vietnamese="xin chào",
            correct_index=0,
            correct_sequence=[1],
            alternatives=[[1], [2]],
        )

    def _generate_distractors(self, correct_sequence: list[int]) -> list[list[int]]:
        """Generate distractor sequences."""
        all_tones = [1, 2, 3, 4, 5, 6]
        distractors = [correct_sequence]

        for _ in range(50):
            if len(distractors) >= 4:
                break
            new_seq = []
            for correct_tone in correct_sequence:
                if random.random() < 0.7:
                    other_tones = [t for t in all_tones if t != correct_tone]
                    new_seq.append(random.choice(other_tones))
                else:
                    new_seq.append(correct_tone)
            if new_seq != correct_sequence and new_seq not in distractors:
                distractors.append(new_seq)

        while len(distractors) < 4:
            fallback = [(t % 6) + 1 for t in correct_sequence]
            if fallback not in distractors:
                distractors.append(fallback)
            else:
                distractors.append([(i % 6) + 1 for i in range(len(correct_sequence))])

        random.shuffle(distractors)
        return distractors

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


# Singleton instances
_tone_service: Optional[DrillService] = None
_vowel_service: Optional[DrillService] = None


def get_drill_service(drill_type: Literal["tone", "vowel"] = "tone") -> DrillService:
    """Get the singleton DrillService for the given drill type."""
    global _tone_service, _vowel_service

    if drill_type == "tone":
        if _tone_service is None:
            _tone_service = DrillService("tone")
        return _tone_service
    else:
        if _vowel_service is None:
            _vowel_service = DrillService("vowel")
        return _vowel_service
