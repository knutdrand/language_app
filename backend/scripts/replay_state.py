"""Replay attempts.json to rebuild ML confusion states.

This script reads the tone_attempts from attempts.json and replays them
through the ML service to rebuild the confusion state from scratch.

Usage:
    python scripts/replay_state.py [--verify]

With --verify, compares rebuilt state against existing confusion_state in progress.json.
"""

from __future__ import annotations

import json
import argparse
from pathlib import Path
from typing import Optional

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.ml import (
    Problem,
    Answer,
    ConfusionState,
    get_ml_service,
    make_problem_type_id,
)


def load_attempts(data_dir: Path) -> list[dict]:
    """Load tone attempts from attempts.json."""
    attempts_file = data_dir / "attempts.json"
    if not attempts_file.exists():
        raise FileNotFoundError(f"Attempts file not found: {attempts_file}")

    with open(attempts_file) as f:
        data = json.load(f)

    return data.get("tone_attempts", [])


def replay_attempts(attempts: list[dict]) -> dict[str, ConfusionState]:
    """Replay attempts to rebuild confusion states.

    Returns dict mapping problem_type_id to rebuilt ConfusionState.
    """
    ml = get_ml_service()
    states: dict[str, ConfusionState] = {}

    for attempt in attempts:
        # Determine problem type from sequence length
        correct_sequence = attempt["correct_sequence"]
        syllable_count = len(correct_sequence)
        problem_type_id = make_problem_type_id("tone", syllable_count)

        # Get or create state for this problem type
        if problem_type_id not in states:
            states[problem_type_id] = ml.get_initial_state(problem_type_id)

        state = states[problem_type_id]

        # Create Problem and Answer
        problem = Problem(
            problem_type_id=problem_type_id,
            word_id=attempt["word_id"],
            vietnamese=attempt["vietnamese"],
            correct_index=0,  # Not used for replay
            correct_sequence=correct_sequence,
            alternatives=attempt["alternatives"],
        )

        answer = Answer(
            selected_sequence=attempt["selected_sequence"],
            elapsed_ms=attempt["response_time_ms"],
        )

        # Update state
        new_state, _ = ml.update_state(state, problem, answer)
        states[problem_type_id] = new_state

    return states


def load_existing_state(data_dir: Path) -> dict | None:
    """Load existing confusion state from progress.json if available."""
    progress_file = data_dir / "progress.json"
    if not progress_file.exists():
        return None

    with open(progress_file) as f:
        data = json.load(f)

    # The old format stored confusion_state directly
    # We'd need to check the actual format
    return data


def compare_states(
    rebuilt: dict[str, ConfusionState],
    existing_counts: list[list[float]] | None,
) -> None:
    """Compare rebuilt state against existing state."""
    if existing_counts is None:
        print("No existing state to compare against")
        return

    # The old format was just tone_1 equivalent
    if "tone_1" not in rebuilt:
        print("No tone_1 state rebuilt")
        return

    rebuilt_counts = rebuilt["tone_1"].counts

    print("\nComparison (rebuilt vs existing):")
    print("=" * 50)

    total_diff = 0
    for i in range(len(rebuilt_counts)):
        for j in range(len(rebuilt_counts[i])):
            rebuilt_val = rebuilt_counts[i][j]
            existing_val = existing_counts[i][j] if i < len(existing_counts) and j < len(existing_counts[i]) else 0
            diff = abs(rebuilt_val - existing_val)
            total_diff += diff
            if diff > 0.01:
                print(f"  [{i+1}][{j+1}]: rebuilt={rebuilt_val:.2f}, existing={existing_val:.2f}, diff={diff:.2f}")

    print(f"\nTotal absolute difference: {total_diff:.2f}")


def print_state_summary(states: dict[str, ConfusionState]) -> None:
    """Print summary of rebuilt states."""
    print("\nRebuilt States Summary:")
    print("=" * 50)

    for problem_type_id, state in sorted(states.items()):
        counts = state.counts
        total_obs = sum(sum(row) for row in counts)
        diagonal_obs = sum(counts[i][i] for i in range(len(counts)))
        off_diagonal = total_obs - diagonal_obs

        # Subtract priors (initial state has priors baked in)
        ml = get_ml_service()
        initial = ml.get_initial_state(problem_type_id)
        initial_total = sum(sum(row) for row in initial.counts)
        actual_obs = total_obs - initial_total

        print(f"\n{problem_type_id}:")
        print(f"  Matrix size: {state.n_classes}x{state.n_classes}")
        print(f"  Total observations (excluding prior): {actual_obs:.0f}")
        print(f"  Diagonal (correct): {diagonal_obs:.1f}")
        print(f"  Off-diagonal (errors): {off_diagonal:.1f}")

        # Print confusion matrix
        print(f"\n  Confusion matrix (counts):")
        for i, row in enumerate(counts):
            row_str = " ".join(f"{v:6.1f}" for v in row)
            print(f"    {i+1}: [{row_str}]")


def save_rebuilt_states(states: dict[str, ConfusionState], output_file: Path) -> None:
    """Save rebuilt states to JSON file."""
    output = {
        problem_type_id: state.model_dump()
        for problem_type_id, state in states.items()
    }

    with open(output_file, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\nSaved rebuilt states to: {output_file}")


def main():
    parser = argparse.ArgumentParser(description="Replay attempts to rebuild ML states")
    parser.add_argument("--verify", action="store_true", help="Compare against existing state")
    parser.add_argument("--save", type=str, help="Save rebuilt states to file")
    parser.add_argument("--data-dir", type=str, default="data", help="Data directory")
    args = parser.parse_args()

    data_dir = Path(__file__).parent.parent / args.data_dir

    # Load attempts
    print(f"Loading attempts from {data_dir / 'attempts.json'}...")
    attempts = load_attempts(data_dir)
    print(f"Found {len(attempts)} tone attempts")

    # Replay
    print("\nReplaying attempts...")
    states = replay_attempts(attempts)

    # Print summary
    print_state_summary(states)

    # Verify if requested
    if args.verify:
        existing = load_existing_state(data_dir)
        if existing and "confusion_state" in existing:
            compare_states(states, existing["confusion_state"].get("counts"))

    # Save if requested
    if args.save:
        save_rebuilt_states(states, Path(args.save))


if __name__ == "__main__":
    main()
