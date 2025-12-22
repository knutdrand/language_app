"""Tests for vowel drill service."""
import pytest
from app.services.vowel_drill import (
    VowelDrillService,
    VowelConfusionState,
    NUM_VOWELS,
    extract_vowel_nucleus,
    has_diphthong,
    count_vowels_in_syllable,
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

    def test_extract_diphthong_allowed(self):
        """Diphthong syllables should return the primary vowel when allowed."""
        test_cases = [
            ("đầu", 3),   # â is primary (has tone mark)
            ("núi", 10),  # u is primary (more open than i)
            ("khỏe", 7),  # o is primary (more open than e)
        ]
        for syllable, expected_id in test_cases:
            result = extract_vowel_nucleus(syllable, allow_diphthongs=True)
            assert result == expected_id, f"Expected {expected_id} for '{syllable}', got {result}"

    def test_extract_diphthong_not_allowed(self):
        """Diphthong syllables should return None when not allowed."""
        diphthongs = ["đầu", "núi", "khỏe", "mèo", "nước"]
        for syllable in diphthongs:
            result = extract_vowel_nucleus(syllable, allow_diphthongs=False)
            assert result is None, f"Expected None for diphthong '{syllable}', got {result}"

    def test_count_vowels(self):
        """Vowel counting should be accurate."""
        test_cases = [
            ("mắt", 1),
            ("đầu", 2),
            ("nước", 2),
            ("chị", 1),
        ]
        for syllable, expected_count in test_cases:
            result = count_vowels_in_syllable(syllable)
            assert result == expected_count, f"Expected {expected_count} for '{syllable}', got {result}"

    def test_has_diphthong(self):
        """Diphthong detection should be accurate."""
        diphthongs = ["đầu", "núi", "khỏe", "mèo", "nước"]
        simple = ["mắt", "chị", "ký", "rất", "năm"]

        for syllable in diphthongs:
            assert has_diphthong(syllable), f"'{syllable}' should be detected as diphthong"

        for syllable in simple:
            assert not has_diphthong(syllable), f"'{syllable}' should not be detected as diphthong"


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

    def test_pair_beta_params_returned(self):
        """
        Verify that pair probabilities return alpha/beta params.
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

        # Each pair should have alpha and beta keys
        for p in pair_probs:
            assert "pair" in p, "pair key missing"
            assert "alpha" in p, "alpha key missing"
            assert "beta" in p, "beta key missing"
            # Alpha should be at least the prior (2 * PSEUDOCOUNT = 10 for vowels)
            assert p["alpha"] >= 10, f"alpha should be >= 10, got {p['alpha']}"
            assert p["beta"] >= 10, f"beta should be >= 10, got {p['beta']}"

        # The correct total comes from get_total_attempts
        actual_total = service.get_total_attempts(confusion_state)

        # Verify actual total equals drills done
        assert actual_total == num_drills, (
            f"get_total_attempts should return {num_drills}, got {actual_total}"
        )


class TestSimpleVowelIndex:
    """Tests for the simple vowel word index (no diphthongs)."""

    def test_simple_vowel_words_exclude_diphthongs(self):
        """Words in simple vowel index should not contain diphthongs."""
        service = VowelDrillService()

        for vowel_id, words in service._simple_vowel_words.items():
            for word in words:
                syllables = word.vietnamese.strip().split()
                # Only mono-syllabic words
                assert len(syllables) == 1, (
                    f"Word '{word.vietnamese}' in simple index is not mono-syllabic"
                )
                # No diphthongs
                assert not has_diphthong(syllables[0]), (
                    f"Word '{word.vietnamese}' in simple index has diphthong"
                )

    def test_mono_syllabic_words_method_returns_simple_vowels(self):
        """get_mono_syllabic_words should only return simple vowel words."""
        service = VowelDrillService()

        for vowel_id in range(1, NUM_VOWELS + 1):
            words = service.get_mono_syllabic_words(vowel_id)
            for word in words:
                syllables = word.vietnamese.strip().split()
                assert len(syllables) == 1
                assert not has_diphthong(syllables[0]), (
                    f"get_mono_syllabic_words({vowel_id}) returned diphthong: {word.vietnamese}"
                )


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
