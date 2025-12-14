# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Language learning application focused on listening/speaking/visual learning rather than text-based approaches. Uses FSRS (Free Spaced Repetition Scheduler) to track user proficiency and schedule optimal repetition.

## Commands

```bash
# Frontend development
cd frontend
npm install          # Install dependencies
npm run dev          # Start dev server at http://localhost:5173
npm run build        # Production build
npm run preview      # Preview production build
npm run test         # Run tests in watch mode
npm run test:run     # Run tests once
```

## Technology Stack

- **Frontend**: React + Vite + TypeScript + Tailwind CSS
- **State**: Zustand (progress tracking), ts-fsrs (spaced repetition)
- **Audio**: Browser speechSynthesis API (Vietnamese TTS)
- **Storage**: localStorage (card states, session stats)
- **Backend**: (planned) Python with FastAPI + SQLModel + SQLite

## Architecture

```
frontend/src/
├── components/
│   ├── Drill.tsx        # Main drill orchestration
│   ├── AudioButton.tsx  # TTS playback button
│   └── ImageGrid.tsx    # 2x2 image selection grid
├── hooks/
│   ├── useFSRS.ts       # FSRS scheduling wrapper
│   └── useProgress.ts   # Session stats (Zustand store)
├── data/
│   └── words.json       # 50 Vietnamese words with Unsplash images
└── types.ts             # TypeScript interfaces
```

### Core Flow
1. FSRS selects next due word
2. User clicks Play → hears Vietnamese word via speechSynthesis
3. User selects from 4 images (1 correct + 3 distractors)
4. Result recorded → FSRS updates scheduling
5. Progress persisted to localStorage

### FSRS Integration
Uses `ts-fsrs` library. Cards stored in localStorage under `language_app_cards`. On correct answer: Rating.Good, on incorrect: Rating.Again.

## Target Languages

Vietnamese (implemented), Norwegian and Spanish (planned)

## Terminology

"Word" is used interchangeably with "n-gram" throughout the codebase.
