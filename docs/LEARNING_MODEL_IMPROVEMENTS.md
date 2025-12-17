# Learning Model Improvement Plan

## Current Implementation Analysis

### What's Working Well
- FSRS spaced repetition with custom tone-learning parameters (max 3 days vs default 36 years)
- Two-track system: word-based cards + tone-sequence cards
- Progressive syllable unlocking (master 1-syllable before 2-syllable, 70% accuracy gate)
- Priority-weighted selection based on frequency, difficulty, and urgency

### Key Weaknesses Identified

1. **Random Distractor Generation**
   - Currently generates random tone swaps with 70% probability per position
   - Creates wildly inconsistent difficulty (sometimes trivially easy, sometimes impossible)
   - No consideration for phonetic similarity or learning difficulty
   - Location: `frontend/src/utils/tones.ts` → `getDistractorSequences()`

2. **Binary Rating Scale**
   - Only uses Good/Again instead of FSRS's full 4-point scale (Again/Hard/Good/Easy)
   - Loses valuable learning signal about confidence and difficulty
   - Location: `frontend/src/hooks/useToneFSRS.ts` → `recordReview()`

3. **No Syllable-Level Tracking**
   - For multi-syllable words, can't tell which position was wrong
   - Records only sequence-level correct/incorrect
   - Location: `frontend/src/components/ToneDrill.tsx`

4. **Problem Tones Found in Data (from attempts.json analysis):**
   - Tones 4 (Dipping/Hỏi) & 5 (Creaky/Ngã) frequently confused (acoustic similarity)
   - Sequence "3-4" showing only 29% accuracy but still scheduled 3 days out
   - Overall accuracy: ~67%

---

## Recommended Improvements

### Phase 1: Quick Wins (High Impact, Low-Medium Effort)

#### 1.1 Intelligent Distractor Generation
**Rationale:** Directly improves learning quality; current system wastes ~40% of attempts

**Implementation:**
- Classify tone pairs by acoustic similarity:
  - Hard pairs: 4-5 (both have rising-falling pitch)
  - Medium pairs: 2-6, 1-3
  - Easy pairs: 1-6, 2-5
- Generate distractors strategically:
  - 1 distractor from same-difficulty category (tests true discrimination)
  - 1 distractor from medium-difficulty category
  - 1 distractor from easy category (provides confidence)
- For multi-syllable: vary individual positions systematically (not random swap-all)

**Location:** `frontend/src/utils/tones.ts` → `getDistractorSequences()`

#### 1.2 Upgrade FSRS Rating Scale to 4-Point
**Rationale:** Standard FSRS uses [Again, Hard, Good, Easy]; current binary loses signal

**Implementation:**
- Add difficulty detection based on running accuracy:
  - accuracy < 30% → Again
  - 30-70% → Hard
  - 70-90% → Good
  - >90% → Easy
- Update `recordReview` to compute difficulty from running accuracy

**Location:** `frontend/src/hooks/useToneFSRS.ts` → `recordReview()`

#### 1.3 Acoustic Contour Feedback
**Rationale:** Tones are auditory; visual symbols alone insufficient for discrimination

**Implementation:**
- Display pitch contour alongside tone symbols:
  - Tone 1 (Level): ―― (straight)
  - Tone 2 (Falling): ↘ (downward)
  - Tone 3 (Rising): ↗ (upward)
  - Tone 4 (Dipping): ↗↘ (rise then fall)
  - Tone 5 (Creaky): ⤴ (high rising, tense)
  - Tone 6 (Heavy): ↓ (low, falling)
- After incorrect response, show correct contour vs. selected contour side-by-side

**Location:** `frontend/src/utils/tones.ts` → add contour mapping

---

### Phase 2: Diagnostics & Personalization (Medium Effort)

#### 2.1 Syllable-Level Error Tracking
**Rationale:** Enables diagnosis of where multi-syllable failures occur

**Implementation:**
- Extend `ToneAttempt` to include per-position correctness: `positionCorrect: boolean[]`
- Compute which positions were wrong in UI
- In feedback: highlight incorrect syllables ("✓ Position 1, ✗ Position 2")

**Location:** `frontend/src/components/ToneDrill.tsx`, backend attempt schema

#### 2.2 Personalized Difficulty Thresholds
**Rationale:** Different tones have different confusability

**Implementation:**
- Create tone-difficulty mapping:
  ```typescript
  const unlockThresholds = {
    "single_tone_easy": 0.65,  // Tones 1-3
    "single_tone_hard": 0.80,  // Tones 4-6
    "two_tone_easy": 0.70,
    "two_tone_hard": 0.80      // e.g., 4-5 combinations
  };
  ```
- Adjust unlock logic to use per-sequence thresholds

**Location:** `frontend/src/hooks/useToneFSRS.ts` → `isSyllableLevelUnlocked()`

#### 2.3 Session Analytics Dashboard
**Rationale:** Reveals learning patterns; guides user behavior

**Implementation:**
- New API endpoint `/api/analytics/tone-stats`:
  - Per-tone accuracy
  - Weakest 5 sequences
  - Average response time trend
- Frontend page with tone accuracy heatmap
- Recommendation: "Focus on tones 4-6 this week"

**Location:** New backend endpoint, new frontend page

---

### Phase 3: Advanced Learning (Higher Effort)

#### 3.1 Syllable-Pair Progressive Training
**Rationale:** Decomposing multi-syllable into pairs scaffolds learning

**Implementation:**
- For 3+ syllable words, create intermediate drills:
  - "thành phố hồ chí minh" [2,3,2,3,1] → pairs: [2,3], [3,2], [2,3], [3,1]
- Unlock full sequence only after mastering constituent pairs

#### 3.2 Audio-Based Recognition Mode
**Rationale:** Tests true perception, not visual recognition

**Implementation:**
- New drill mode: play audio, show 6 tone options
- Track accuracy separately from visual drill
- Identify users who are guessing vs. actually perceiving

#### 3.3 Personalized Tone Mastery Profiles
**Rationale:** Adaptive learning requires understanding learner's weaknesses

**Implementation:**
- Backend computes per-tone stats:
  - Tone 1: 85% (mastered) → reduce frequency
  - Tone 4: 40% (struggling) → boost frequency
- FSRS scheduler biases toward weak tones

---

## Expected Outcomes

| Phase | Target Accuracy | Key Changes |
|-------|----------------|-------------|
| Current | ~66% | Binary feedback, random distractors |
| Phase 1 | 75% | Smart distractors, 4-point FSRS, contour feedback |
| Phase 2 | 82% | Syllable diagnostics, personalized thresholds |
| Phase 3 | 85%+ | Audio mode, pair training, adaptive profiles |

---

## Implementation Priority

1. **Intelligent distractor generation** (highest impact)
2. **4-point FSRS rating scale** (quick win)
3. **Acoustic contour feedback** (easy visual improvement)
4. **Syllable-level error tracking** (enables future improvements)
5. **Analytics dashboard** (user engagement)
6. **Audio recognition mode** (advanced learning)

---

## Code Locations Reference

| Feature | File |
|---------|------|
| Distractor generation | `frontend/src/utils/tones.ts` |
| FSRS rating | `frontend/src/hooks/useToneFSRS.ts` |
| Tone symbols | `frontend/src/utils/tones.ts` |
| Drill UI | `frontend/src/components/ToneDrill.tsx` |
| Attempt recording | `backend/app/routers/attempts.py` |
| Card state | `backend/data/tone_cards.json` |
| Attempt history | `backend/data/attempts.json` |
