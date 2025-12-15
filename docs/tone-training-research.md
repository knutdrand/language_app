# Tone Training: Scheduling Research Summary

## The Problem

FSRS (Free Spaced Repetition Scheduler) is optimized for **long-term memory retention** (vocabulary, facts). Tone recognition is a **perceptual skill** that requires different training approaches.

## Key Research Findings

### Perceptual Learning Requires Volume

Studies on tone frequency discrimination found:
- **900 trials/day** → consistent improvement
- **360 trials/day** → no improvement above baseline

This suggests a minimum threshold of practice per session is required for perceptual learning to occur.

### Distributed Practice Still Wins (Across Days)

- Spacing sessions across multiple days beats cramming into one day
- But within each session, massed practice (many repetitions) is beneficial
- For skills, performance is often *better* at spaced repetitions (unlike memory where retrieval is harder)

### Skill Learning vs Memory

| Aspect | Memory (Vocabulary) | Skill (Tone Perception) |
|--------|---------------------|-------------------------|
| Mechanism | Retrieval difficulty strengthens memory | Neural pattern formation |
| Within-session | Spacing helps | Massed practice helps |
| Across-days | Long intervals (days/weeks) | Shorter intervals, daily practice |
| Optimal | FSRS-style expanding intervals | High volume, shorter max intervals |

## Implications for Vietnamese Tone Drill

### Current Approach (FSRS)
- Intervals expand: 1 day → 3 days → 7 days → weeks
- Optimized for remembering word meanings
- **Too spread out for skill acquisition**

### Recommended Approach for Tones

| Phase | Strategy |
|-------|----------|
| **Learning** | High volume per session (50-100+ trials), minimal spacing within session |
| **Consolidation** | Daily practice for 1-2 weeks |
| **Maintenance** | Gradually increase intervals (but cap at 1-3 days) |

### Implementation Options

1. **Shorter max intervals**: Cap at 1-3 days instead of weeks
2. **Session-based quotas**: Require minimum 30-50 tone drills per session
3. **Accuracy-based progression**: Only increase intervals when accuracy > 80%
4. **Confusion-pair focus**: Concentrate on specific tone pairs that cause errors

## Vietnamese Tone Confusion Pairs

Common confusions for non-native speakers:
- **hỏi (ả)** vs **ngã (ã)** - both have a "dip" but ngã rises sharply at end
- **sắc (á)** vs **nặng (ạ)** - both short, one rises, one falls
- **huyền (à)** vs **ngang (a)** - subtle pitch difference

---

## Implementation (December 2024)

The frequency-weighted scheduler was implemented in `feature/frequency-weighted-tone-scheduler` branch.

### Key Changes

**New files:**
- `frontend/src/data/toneFrequencies.ts` - Tone sequence frequency data and priority tiers

**Modified files:**
- `frontend/src/hooks/useToneFSRS.ts` - Frequency-weighted selection algorithm

### Algorithm

Priority Score = `frequency_weight × tier_multiplier × due_urgency × proficiency_factor`

Where:
- **frequency_weight**: 0-1 based on how common the tone pattern is (Level=14%, Rising=12.6%, etc.)
- **tier_multiplier**: 3x for tier 1 (single tones + common combos), 2x for tier 2, 1x for tier 3
- **due_urgency**: Higher for overdue items, 2x for new items, 0.1x for not-yet-due
- **proficiency_factor**: 1.5 at 0% accuracy, 0.5 at 100% accuracy

### FSRS Parameters for Skill Training

```typescript
const SKILL_TRAINING_PARAMS = {
  maximum_interval: 3,        // Cap at 3 days (vs weeks/months for memory)
  request_retention: 0.85,    // 85% target retention
  // ... adjusted stability weights for shorter initial intervals
};
```

### Priority Tiers

| Tier | Sequences | Coverage |
|------|-----------|----------|
| 1 | Single tones + most common 2-tone combos (1, 3, 2, 6, 4, 5, 1-2, 2-2, 2-1) | ~65% |
| 2 | Common 2-tone combos (3-2, 3-1, 1-1, 1-6, etc.) | ~20% |
| 3 | Everything else | ~15% |

## Sources

- [The right time to learn: mechanisms and optimization of spaced learning](https://pmc.ncbi.nlm.nih.gov/articles/PMC5126970/)
- [Spacing Repetitions Over Long Timescales](https://pmc.ncbi.nlm.nih.gov/articles/PMC5476736/)
- [Training American listeners to perceive Mandarin tones](https://kuppl.ku.edu/sites/kuppl/files/documents/publications/Wang_Spence_Jongman_Sereno_training_JASA_1999.pdf)
- [Distributed practice - Wikipedia](https://en.wikipedia.org/wiki/Distributed_practice)
- [Evidence of the Spacing Effect and Influences on Perceptions of Learning](https://pmc.ncbi.nlm.nih.gov/articles/PMC8759977/)
