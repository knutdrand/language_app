"""Tests for Bradley-Terry model implementation."""
import pytest
import math
from app.ml.bradley_terry import (
    compute_bt_strengths,
    compute_bt_strengths_logspace,
    pairwise_probability,
    choice_probability,
)


class TestBTStrengths:
    """Tests for Bradley-Terry strength estimation."""

    def test_uniform_wins_equal_strengths(self):
        """Equal wins in all directions should give equal strengths."""
        # Each pair has equal wins in both directions
        wins = [
            [0, 5, 5],
            [5, 0, 5],
            [5, 5, 0],
        ]
        theta = compute_bt_strengths(wins, prior=0.0)

        # All strengths should be equal (normalized to sum = n = 3)
        assert len(theta) == 3
        for t in theta:
            assert abs(t - 1.0) < 0.01, f"Expected ~1.0, got {t}"

    def test_dominance_ordering(self):
        """Item 0 always wins should have highest strength."""
        wins = [
            [0, 10, 10],  # Item 0 beats 1 and 2
            [0, 0, 5],    # Item 1 beats 2 sometimes
            [0, 5, 0],    # Item 2 beats 1 sometimes
        ]
        theta = compute_bt_strengths(wins, prior=0.1)

        assert theta[0] > theta[1], "Item 0 should be stronger than item 1"
        assert theta[0] > theta[2], "Item 0 should be stronger than item 2"

    def test_convergence_to_empirical(self):
        """With large counts and isolated pair, BT probability approaches empirical."""
        # Simple 2-item case: 80% of comparisons won by item 0
        wins = [
            [0, 80],
            [20, 0],
        ]
        theta = compute_bt_strengths(wins, prior=0.0)

        p_01 = pairwise_probability(theta, 0, 1)
        empirical = 80 / 100  # 80 wins out of 100 comparisons

        assert abs(p_01 - empirical) < 0.01, f"Expected ~{empirical}, got {p_01}"

    def test_prior_regularization(self):
        """Prior should pull estimates toward uniform."""
        wins = [
            [0, 10, 0],
            [0, 0, 0],
            [0, 0, 0],
        ]

        theta_low_prior = compute_bt_strengths(wins, prior=0.1)
        theta_high_prior = compute_bt_strengths(wins, prior=10.0)

        # With high prior, ratio should be closer to 1
        ratio_low = theta_low_prior[0] / theta_low_prior[1]
        ratio_high = theta_high_prior[0] / theta_high_prior[1]

        assert ratio_high < ratio_low, "High prior should moderate strength differences"

    def test_empty_wins(self):
        """Empty wins matrix should return empty."""
        theta = compute_bt_strengths([], prior=1.0)
        assert theta == []

    def test_single_item(self):
        """Single item should return strength of 1."""
        wins = [[0]]
        theta = compute_bt_strengths(wins, prior=1.0)
        assert len(theta) == 1
        assert abs(theta[0] - 1.0) < 0.01

    def test_logspace_matches_regular(self):
        """Log-space implementation should match regular for normal cases."""
        wins = [
            [0, 5, 10],
            [3, 0, 7],
            [2, 4, 0],
        ]

        theta_regular = compute_bt_strengths(wins, prior=1.0)
        theta_logspace = compute_bt_strengths_logspace(wins, prior=1.0)

        for i in range(len(theta_regular)):
            assert abs(theta_regular[i] - theta_logspace[i]) < 0.01, (
                f"Mismatch at {i}: regular={theta_regular[i]}, log={theta_logspace[i]}"
            )

    def test_logspace_handles_extreme_dominance(self):
        """Log-space should handle extreme strength differences without overflow."""
        # Item 0 dominates massively
        wins = [
            [0, 1000, 1000, 1000],
            [0, 0, 0, 0],
            [0, 0, 0, 0],
            [0, 0, 0, 0],
        ]

        # This should not raise overflow errors
        theta = compute_bt_strengths_logspace(wins, prior=0.1)

        assert len(theta) == 4
        assert theta[0] > theta[1]
        assert all(t > 0 for t in theta), "All strengths should be positive"


class TestPairwiseProbability:
    """Tests for pairwise probability computation."""

    def test_symmetric_strengths(self):
        """Equal strengths should give 50% probability."""
        theta = [1.0, 1.0]
        p = pairwise_probability(theta, 0, 1)
        assert abs(p - 0.5) < 0.01

    def test_stronger_item_wins_more(self):
        """Stronger item should have higher probability."""
        theta = [3.0, 1.0]
        p_01 = pairwise_probability(theta, 0, 1)
        p_10 = pairwise_probability(theta, 1, 0)

        assert p_01 > 0.5
        assert p_10 < 0.5
        assert abs(p_01 + p_10 - 1.0) < 0.01  # Should sum to 1

    def test_zero_strength_fallback(self):
        """Zero strengths should return 0.5."""
        theta = [0.0, 0.0]
        p = pairwise_probability(theta, 0, 1)
        assert p == 0.5


class TestChoiceProbability:
    """Tests for choice probability (Luce choice rule)."""

    def test_uniform_strengths(self):
        """Uniform strengths should give uniform choice probability."""
        theta = [1.0, 1.0, 1.0, 1.0]
        p = choice_probability(theta, target=0, alternatives=[0, 1, 2, 3])
        assert abs(p - 0.25) < 0.01

    def test_stronger_target(self):
        """Stronger target should have higher choice probability."""
        theta = [3.0, 1.0, 1.0, 1.0]
        p = choice_probability(theta, target=0, alternatives=[0, 1, 2, 3])
        expected = 3.0 / 6.0  # 3 / (3+1+1+1)
        assert abs(p - expected) < 0.01

    def test_target_not_in_alternatives(self):
        """Target not in alternatives should return 0."""
        theta = [1.0, 1.0, 1.0]
        p = choice_probability(theta, target=0, alternatives=[1, 2])
        assert p == 0.0

    def test_two_choice(self):
        """Two-choice should match pairwise probability."""
        theta = [2.0, 3.0]
        p_choice = choice_probability(theta, target=0, alternatives=[0, 1])
        p_pairwise = pairwise_probability(theta, 0, 1)
        assert abs(p_choice - p_pairwise) < 0.01


class TestBTIntegration:
    """Integration tests combining strength estimation and probability."""

    def test_full_workflow(self):
        """Test complete workflow: observe wins -> estimate -> predict."""
        # Simulate: item 0 is "good", item 1 is "medium", item 2 is "weak"
        # 0 beats 1: 7/10, 0 beats 2: 9/10, 1 beats 2: 6/10
        wins = [
            [0, 7, 9],
            [3, 0, 6],
            [1, 4, 0],
        ]

        theta = compute_bt_strengths(wins, prior=1.0)

        # Ordering should be preserved
        assert theta[0] > theta[1] > theta[2], "Ordering should be 0 > 1 > 2"

        # Choice probability in 4-way
        p = choice_probability(theta, target=0, alternatives=[0, 1, 2])
        assert p > 0.5, "Best item should have >50% probability in 3-way choice"

    def test_reproducibility(self):
        """Same input should give same output."""
        wins = [
            [0, 5, 3],
            [2, 0, 4],
            [1, 3, 0],
        ]

        theta1 = compute_bt_strengths(wins, prior=1.0)
        theta2 = compute_bt_strengths(wins, prior=1.0)

        for i in range(len(theta1)):
            assert theta1[i] == theta2[i], f"Results should be identical"


class TestBradleyTerryMLService:
    """Tests for the BradleyTerryMLService integration."""

    def test_update_records_confusion_matrix(self):
        """update_state should record in confusion matrix: counts[correct][selected]."""
        from app.ml.luce_service import BradleyTerryMLService
        from app.ml.types import Problem, Answer

        service = BradleyTerryMLService(prior=1.0)
        state = service.get_initial_state("tone_1")

        problem = Problem(
            problem_type_id="tone_1",
            word_id=0,
            vietnamese="test",
            english="test",
            correct_index=0,
            correct_sequence=[1],  # Tone 1 is correct
            alternatives=[[2], [3], [4]],  # Tones 2, 3, 4 are alternatives
        )
        answer = Answer(selected_sequence=[1], elapsed_ms=1000)  # User chose correctly

        new_state, updates = service.update_state(state, problem, answer)

        # Should have 1 update: counts[correct=1][selected=1]
        assert len(updates) == 1
        assert updates[0].tracker_id == "counts[1][1]"

        # Check confusion matrix was updated correctly
        assert new_state.counts[0][0] == 1.0  # counts[1][1] = 1 (0-indexed)
        assert new_state.counts[0][1] == 0.0  # No confusion with 2
        assert new_state.counts[0][2] == 0.0  # No confusion with 3

    def test_update_records_wrong_answer(self):
        """When user selects wrong answer, records confusion: counts[correct][wrong_selected]."""
        from app.ml.luce_service import BradleyTerryMLService
        from app.ml.types import Problem, Answer

        service = BradleyTerryMLService(prior=1.0)
        state = service.get_initial_state("tone_1")

        problem = Problem(
            problem_type_id="tone_1",
            word_id=0,
            vietnamese="test",
            english="test",
            correct_index=0,
            correct_sequence=[1],
            alternatives=[[2], [3], [4]],
        )
        # User incorrectly chose tone 2
        answer = Answer(selected_sequence=[2], elapsed_ms=1000)

        new_state, updates = service.update_state(state, problem, answer)

        # Should have 1 update: counts[correct=1][selected=2]
        assert len(updates) == 1
        assert updates[0].tracker_id == "counts[1][2]"

        # counts[0][1] should be 1 (0-indexed): when 1 was correct, user selected 2
        assert new_state.counts[0][1] == 1.0
        assert new_state.counts[0][0] == 0.0  # User didn't select correct

    def test_success_probability_uses_confusion_matrix(self):
        """Success probability should be based on confusion matrix counts."""
        from app.ml.luce_service import BradleyTerryMLService, BradleyTerryState
        from app.ml.types import Problem

        service = BradleyTerryMLService(prior=1.0)

        # Create state with confusion matrix data
        # When class 1 is correct, user mostly selects 1 (correct)
        n = 6
        counts = [[0.0] * n for _ in range(n)]
        counts[0][0] = 10.0  # When 1 correct, selected 1 (correct) 10 times
        counts[0][1] = 2.0   # When 1 correct, selected 2 (wrong) 2 times
        counts[0][2] = 1.0   # When 1 correct, selected 3 (wrong) 1 time

        state = BradleyTerryState(n_classes=n, counts=counts, prior=1.0, model_version=3)

        problem = Problem(
            problem_type_id="tone_1",
            word_id=0,
            vietnamese="test",
            english="test",
            correct_index=0,
            correct_sequence=[1],
            alternatives=[[2], [3]],
        )

        beta_params = service.get_success_distribution(problem, state)

        # P(correct) = (10+1) / (10+2+1+3) = 11/16 ≈ 0.69
        # (counts[0][0] + prior) / (counts[0][0] + counts[0][1] + counts[0][2] + 3*prior)
        mean_prob = beta_params.mean
        assert mean_prob > 0.5, f"Expected above-chance success prob, got {mean_prob}"
        assert mean_prob < 0.8, f"Expected below 0.8, got {mean_prob}"

    def test_get_all_pair_stats(self):
        """get_all_pair_stats should return Beta params for all pairs."""
        from app.ml.luce_service import BradleyTerryMLService

        service = BradleyTerryMLService(prior=1.0)
        state = service.get_initial_state("tone_1")

        pair_stats = service.get_all_pair_stats("tone_1", state)

        # Should have 6 choose 2 = 15 pairs for 6 tones
        assert len(pair_stats) == 15

        # All pairs should have valid Beta params
        for (i, j), beta in pair_stats.items():
            assert 1 <= i < j <= 6
            assert beta.alpha > 0
            assert beta.beta > 0

    def test_pair_stats_is_mean_of_both_directions(self):
        """Pair success should be mean(P(a|correct=a), P(b|correct=b))."""
        from app.ml.luce_service import BradleyTerryMLService, BradleyTerryState

        service = BradleyTerryMLService(prior=1.0)

        # Create asymmetric confusion: user good at 1, bad at 2
        n = 6
        counts = [[0.0] * n for _ in range(n)]
        counts[0][0] = 8.0   # When 1 correct, selected 1 (correct) 8 times
        counts[0][1] = 2.0   # When 1 correct, selected 2 (wrong) 2 times
        counts[1][1] = 3.0   # When 2 correct, selected 2 (correct) 3 times
        counts[1][0] = 7.0   # When 2 correct, selected 1 (wrong) 7 times

        state = BradleyTerryState(n_classes=n, counts=counts, prior=1.0, model_version=3)

        pair_stats = service.get_all_pair_stats("tone_1", state)
        beta_12 = pair_stats[(1, 2)]

        # Manual calculation:
        prior = 1.0
        # P(1|correct=1, choices={1,2}) = (8+1)/(8+2+2) = 9/12 = 0.75
        p_1_given_1 = (8 + prior) / (8 + 2 + 2 * prior)
        # P(2|correct=2, choices={2,1}) = (3+1)/(3+7+2) = 4/12 = 0.333
        p_2_given_2 = (3 + prior) / (3 + 7 + 2 * prior)
        # Average = (0.75 + 0.333) / 2 = 0.542
        expected_mean = (p_1_given_1 + p_2_given_2) / 2

        actual_mean = beta_12.mean

        # Should be close to the average (Beta mixture approximation may differ slightly)
        assert abs(actual_mean - expected_mean) < 0.05, \
            f"Expected mean ~{expected_mean:.3f}, got {actual_mean:.3f}"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
