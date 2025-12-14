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

# Backend development
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python scripts/generate_audio.py    # Generate audio for all words
uvicorn app.main:app --reload       # Start server at http://localhost:8000
```

## Technology Stack

- **Frontend**: React + Vite + TypeScript + Tailwind CSS
- **State**: Zustand (progress tracking), ts-fsrs (spaced repetition)
- **Audio**: Piper TTS (backend) with browser speechSynthesis fallback
- **Storage**: localStorage (card states, session stats)
- **Backend**: Python with FastAPI + Piper TTS

## Architecture

```
language_app/
├── frontend/src/
│   ├── components/
│   │   ├── Drill.tsx        # Main drill orchestration
│   │   ├── AudioButton.tsx  # Audio playback (backend + fallback)
│   │   └── ImageGrid.tsx    # 2x2 image selection grid
│   ├── hooks/
│   │   ├── useFSRS.ts       # FSRS scheduling wrapper
│   │   └── useProgress.ts   # Session stats (Zustand store)
│   ├── data/
│   │   └── words.json       # 50 Vietnamese words with Unsplash images
│   ├── config.ts            # Backend URL configuration
│   └── types.ts             # TypeScript interfaces
└── backend/
    ├── app/
    │   ├── main.py          # FastAPI app with CORS
    │   ├── tts.py           # Piper TTS wrapper
    │   └── routers/
    │       └── audio.py     # Audio endpoints
    ├── audio/vi/            # Pre-generated Vietnamese audio files
    ├── models/              # Piper voice models (.onnx)
    └── scripts/
        └── generate_audio.py # Batch audio generation
```

### Core Flow
1. FSRS selects next due word
2. User clicks Play → frontend fetches audio from backend
3. If backend unavailable, falls back to browser speechSynthesis
4. User selects from 4 images (1 correct + 3 distractors)
5. Result recorded → FSRS updates scheduling
6. Progress persisted to localStorage

### Audio System
- **Primary**: Pre-generated WAV files via Piper TTS (Vietnamese voice model)
- **Fallback**: Browser speechSynthesis API
- **Voice Model**: vi_VN-vivos-x_low (Northern Vietnamese)

### FSRS Integration
Uses `ts-fsrs` library. Cards stored in localStorage under `language_app_cards`. On correct answer: Rating.Good, on incorrect: Rating.Again.

## Target Languages

Vietnamese (implemented), Norwegian and Spanish (planned)

## Terminology

"Word" is used interchangeably with "n-gram" throughout the codebase.
