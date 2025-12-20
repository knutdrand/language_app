# Language app

## Core ideas

- Focus on listening/speaking/visual as much as possible, not on text
- Use text corpus to find out what are the most relevent words/n-grams
- Keep a machine learning model that tracks how well a user knows specific words/how saturated the learning is
- Repeat words/n-grams that are common and have a potential for learining


# Core technologies

- Rect frontend, with focus on using modern react libraries
- Python backend with fastapi+sqlmodel+sqlite
- Machine learning with pytorch lightning

# Languages

- Focus on vietnamese for now, norwegian and spanish later

# Corpuses

- Use the lyrics of spotify playlists as the text corpus, maybe also newspapers and transcribed podcasts and tv-shows

# Drills

- Play word, and user chooses picture
- Show picture, and user chooses/pronounces word (button to show written word in english)

Word is used interchangably with n-grams

# Tone Drill Progressive Difficulty

The Vietnamese tone drill uses a 3-stage progressive difficulty system:

## Difficulty Levels

1. **2-choice mode** (binary): User picks between 2 tones. The system targets the weakest tone pair (e.g., Rising vs Dipping).

2. **4-choice mode**: User picks from 4 tones. The system targets the weakest 4-tone set.

3. **Multi-syllable mode**: User identifies tone sequences for multi-syllable words.

## Transition Logic

### 2-choice → 4-choice
Requires **both** conditions:
- All 15 tone pair probabilities >= 80%
- At least 100 total attempts across all pairs

### 4-choice → Multi-syllable
Requires:
- All 15 four-choice set probabilities >= 80%

## Confusion Matrix

The system tracks a 6x6 confusion matrix where `counts[i][j]` = number of times tone `j` was selected when tone `i` was played. This is used to:
- Calculate pair success probability: `P(correct | pair) = 0.5 * P(correct | A played) + 0.5 * P(correct | B played)`
- Weight drill selection toward weaker pairs
- Track progress toward difficulty transitions

## Stats Panel

Click "Stats" in the drill UI to see:
- Success probability for each of the 15 tone pairs
- Attempt count per pair
- Total attempts progress toward 100 threshold