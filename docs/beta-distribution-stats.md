# Pairwise Success Probabilities with Beta Distribution

This document explains how the pairwise success probabilities are calculated using a Beta distribution, and how the `alpha` and `beta` parameters are derived from the confusion matrix.

## Overview

The app tracks user performance on distinguishing between pairs of sounds (tones or vowels) using a **confusion matrix**. From this matrix, we compute **Beta distribution parameters** that represent both the estimated success probability and our uncertainty about that estimate.

## The Confusion Matrix

For tones, we maintain a 6x6 matrix. For vowels, a 12x12 matrix.

```
         Chosen →
         T1   T2   T3   T4   T5   T6
       ┌────┬────┬────┬────┬────┬────┐
    T1 │ 15 │  2 │  0 │  1 │  0 │  0 │  ← When T1 was correct
    T2 │  1 │ 12 │  3 │  0 │  0 │  0 │  ← When T2 was correct
    T3 │  0 │  2 │ 18 │  1 │  0 │  0 │  ← When T3 was correct
Correct T4 │  0 │  0 │  1 │ 14 │  2 │  0 │
    ↓  T5 │  0 │  0 │  0 │  3 │ 11 │  1 │
    T6 │  0 │  0 │  0 │  0 │  2 │ 16 │
       └────┴────┴────┴────┴────┴────┘
```

- **Diagonal cells** `counts[i][i]`: Correct answers (user chose the right sound)
- **Off-diagonal cells** `counts[i][j]` where `i ≠ j`: Errors (sound `i` was played, user chose `j`)

## Pairwise Analysis

For a 2-choice drill between sounds A and B, only 4 cells matter:

| Cell | Meaning |
|------|---------|
| `counts[A][A]` | A was correct, user chose A (success) |
| `counts[A][B]` | A was correct, user chose B (error) |
| `counts[B][B]` | B was correct, user chose B (success) |
| `counts[B][A]` | B was correct, user chose A (error) |

## Beta Distribution Parameters

The Beta distribution is a probability distribution on the interval [0, 1], perfect for modeling success rates. It has two parameters:

- **α (alpha)**: Related to number of successes
- **β (beta)**: Related to number of failures

The mean of a Beta(α, β) distribution is:

```
P(success) = α / (α + β)
```

### Calculation

For a pair (A, B), we compute:

```python
# Successes: correct choices in both directions
successes = counts[A][A] + counts[B][B]

# Errors: confusions between A and B in both directions
errors = counts[A][B] + counts[B][A]

# Add prior (pseudocount) for Bayesian smoothing
PSEUDOCOUNT = 2  # for tones (5 for vowels)

alpha = successes + 2 * PSEUDOCOUNT  # prior for each direction
beta = errors + 2 * PSEUDOCOUNT
```

The `2 * PSEUDOCOUNT` accounts for priors in both directions (A→B and B→A).

### Example

Suppose for the pair (T1, T2):
- `counts[0][0] = 15` (T1 correct, chose T1)
- `counts[0][1] = 2`  (T1 correct, chose T2 - error)
- `counts[1][1] = 12` (T2 correct, chose T2)
- `counts[1][0] = 1`  (T2 correct, chose T1 - error)

With PSEUDOCOUNT = 2:

```
alpha = 15 + 12 + 2*2 = 31
beta = 2 + 1 + 2*2 = 7

P(success) = 31 / (31 + 7) = 31/38 ≈ 81.6%
```

## Why Use Beta Distribution?

### 1. Uncertainty Quantification

Unlike a single probability, Beta parameters tell us about uncertainty:

| Scenario | alpha | beta | P(success) | Interpretation |
|----------|-------|------|------------|----------------|
| No data (prior only) | 4 | 4 | 50% | High uncertainty |
| 5 correct, 5 wrong | 9 | 9 | 50% | Moderate uncertainty |
| 50 correct, 50 wrong | 54 | 54 | 50% | Low uncertainty |

All three have 50% probability, but we're much more confident about the third case.

### 2. Bayesian Smoothing

The pseudocount acts as a **prior belief** before seeing any data:
- Prevents extreme probabilities (0% or 100%) with little data
- Regularizes estimates toward 50% when data is sparse
- Larger pseudocount = more conservative estimates

### 3. Natural Updates

When a new drill result comes in:
- Correct answer: α increases by 1
- Wrong answer: β increases by 1

The probability smoothly updates without drastic jumps.

## Display Format

In the frontend, we display:

```
{pct}% ({success}/{total})
```

Where:
- `pct = round(alpha / (alpha + beta) * 100)`
- `success = round(alpha)`
- `total = round(alpha + beta)`

Example: `82% (31/38)`

This shows both the success rate and the effective sample size (which includes the prior).

## Four-Choice Mode

For 4-choice drills with alternatives {A, B, C, D}:

```python
alpha = 0
beta = 0

for correct_tone in [A, B, C, D]:
    # When this tone is correct, count responses to all 4 alternatives
    correct_count = counts[correct_tone][correct_tone]
    error_count = sum(counts[correct_tone][alt] for alt in [A,B,C,D] if alt != correct_tone)

    alpha += correct_count + PSEUDOCOUNT
    beta += error_count + PSEUDOCOUNT
```

## Code References

- Backend calculation: `backend/app/services/tone_drill.py:get_pair_beta_params()`
- Frontend display: `frontend/src/components/ToneDrill.tsx:StatsPanel`
- Vowel version: `backend/app/services/vowel_drill.py:get_pair_beta_params()`

## Configuration

| Parameter | Tones | Vowels | Purpose |
|-----------|-------|--------|---------|
| PSEUDOCOUNT | 2 | 5 | Prior strength per direction |
| Mastery threshold | 80% | 80% | Required P(success) to advance |
| Min attempts (2-choice) | 100 | 200 | Minimum drills before advancing |

The higher pseudocount for vowels reflects the larger number of pairs (66 vs 15) requiring more regularization.
