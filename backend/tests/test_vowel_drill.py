"""Tests for vowel drill service."""
import pytest
from app.services.vowel_drill import (
    VowelDrillService,
    VowelConfusionState,
    NUM_VOWELS,
    extract_vowel_nucleus,
)


class TestVowelExtraction:
    """Tests for vowel extraction functions."""

    def test_extract_simple_vowels(self):
        """Simple vowel syllables should return the correct vowel ID."""
        test_cases = [
            ("mắt", 2),   # ă
            ("chị", 6),   # i
            ("ký", 12),   # y
            ("rất", 3),   # â
            ("năm", 2),   # ă
            ("đẹp", 4),   # e
            ("không", 8), # ô
        ]
        for syllable, expected_id in test_cases:
            result = extract_vowel_nucleus(syllable)
            assert result == expected_id, f"Expected {expected_id} for '{syllable}', got {result}"

    def test_extract_diphthong_returns_primary_vowel(self):
        """Diphthong syllables should return the primary (tone-marked or first) vowel."""
        test_cases = [
            ("đầu", 3),   # â has tone mark
            ("núi", 10),  # u has tone mark
            ("khỏe", 7),  # o has tone mark
        ]
        for syllable, expected_id in test_cases:
            result = extract_vowel_nucleus(syllable)
            assert result == expected_id, f"Expected {expected_id} for '{syllable}', got {result}"



class TestConfusionMatrixCounts:
    """Tests for confusion matrix count consistency."""

    def test_total_count_equals_drills_done(self):
        """Total count in confusion matrix should equal number of drills done."""
        service = VowelDrillService()
        confusion_state = VowelConfusionState(
            counts=[[0] * NUM_VOWELS for _ in range(NUM_VOWELS)]
        )

        num_drills = 20

        for i in range(num_drills):
            # Get a drill
            drill_data = service.sample_next_drill(confusion_state)
            assert drill_data is not None, f"Drill {i+1} should not be None"

            # Simulate answering correctly
            correct_sequence = drill_data["correct_sequence"]
            confusion_state = service.update_confusion_matrix(
                confusion_state,
                correct_sequence,
                correct_sequence,  # Answer correctly
            )

        # Total count in confusion matrix should equal number of drills
        # For mono-syllabic drills, each drill adds 1 to the matrix
        total_in_matrix = service.get_total_attempts(confusion_state)
        assert total_in_matrix == num_drills, (
            f"Expected {num_drills} total attempts, got {total_in_matrix}. "
            f"Difference: {total_in_matrix - num_drills}"
        )

    def test_total_count_with_wrong_answers(self):
        """Total count should be correct regardless of correctness."""
        service = VowelDrillService()
        confusion_state = VowelConfusionState(
            counts=[[0] * NUM_VOWELS for _ in range(NUM_VOWELS)]
        )

        num_drills = 15

        for i in range(num_drills):
            drill_data = service.sample_next_drill(confusion_state)
            assert drill_data is not None

            correct_sequence = drill_data["correct_sequence"]
            # Alternate between correct and wrong answers
            if i % 2 == 0:
                selected = correct_sequence
            else:
                # Pick wrong answer from alternatives
                alts = drill_data["alternatives"]
                selected = alts[0] if alts[0] != correct_sequence else alts[1]

            confusion_state = service.update_confusion_matrix(
                confusion_state,
                correct_sequence,
                selected,
            )

        total_in_matrix = service.get_total_attempts(confusion_state)
        assert total_in_matrix == num_drills, (
            f"Expected {num_drills} total attempts, got {total_in_matrix}"
        )

    def test_pair_probabilities_returned(self):
        """
        Verify that pair probabilities return required fields.
        """
        service = VowelDrillService()
        confusion_state = VowelConfusionState(
            counts=[[0] * NUM_VOWELS for _ in range(NUM_VOWELS)]
        )

        num_drills = 20

        for _ in range(num_drills):
            drill_data = service.sample_next_drill(confusion_state)
            assert drill_data is not None

            correct_sequence = drill_data["correct_sequence"]
            confusion_state = service.update_confusion_matrix(
                confusion_state,
                correct_sequence,
                correct_sequence,
            )

        pair_probs = service.get_all_pair_probabilities(confusion_state)

        # Each pair should have required keys
        for p in pair_probs:
            assert "pair" in p, "pair key missing"
            assert "probability" in p, "probability key missing"
            assert "correct" in p, "correct key missing"
            assert "total" in p, "total key missing"
            # Probability should be between 0 and 1
            assert 0 <= p["probability"] <= 1, f"probability out of range: {p['probability']}"

        # The correct total comes from get_total_attempts
        actual_total = service.get_total_attempts(confusion_state)

        # Verify actual total equals drills done
        assert actual_total == num_drills, (
            f"get_total_attempts should return {num_drills}, got {actual_total}"
        )


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
