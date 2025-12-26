# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Vietnamese tone training application focused on listening comprehension. Uses adaptive ML-based difficulty progression to optimize learning. Backend handles all business logic; frontend apps are thin UI layers.

## Commands

```bash
# Frontend development
cd frontend
npm install          # Install dependencies
npm run dev          # Start dev server at http://localhost:5173
npm run build        # Production build
npm run test:run     # Run tests once

# Backend development
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8023  # Start server at http://localhost:8023

# Mobile development
cd mobile
npm install
npx expo start  # Backend URL defaults to http://localhost:8023
```

## Technology Stack

- **Frontend**: React + Vite + TypeScript + Tailwind CSS
- **Mobile**: React Native + Expo
- **Audio**: FPT.AI TTS (pre-generated MP3 files)
- **Backend**: Python with FastAPI
- **ML**: Beta-Bernoulli model for tone confusion tracking

## Architecture

```
language_app/
├── frontend/src/
│   ├── components/
│   │   ├── ToneDrill.tsx    # Main tone drill UI
│   │   ├── AudioButton.tsx  # Audio playback
│   │   └── ToneGrid.tsx     # Tone selection grid
│   ├── hooks/
│   │   └── useDrillApi.ts   # API hook for drill endpoint
│   └── config.ts            # Backend URL configuration
├── mobile/
│   ├── app/(tabs)/
│   │   ├── index.tsx        # Tone drill screen
│   │   └── speak.tsx        # Speak drill screen
│   ├── hooks/
│   │   └── useDrillApi.ts   # Same API hook as web
│   └── components/          # Shared UI components
└── backend/
    ├── app/
    │   ├── main.py          # FastAPI app
    │   ├── routers/
    │   │   ├── drill.py     # POST /api/drill/next
    │   │   ├── audio.py     # GET /audio/{lang}/{slug}
    │   │   └── asr.py       # Speech recognition
    │   └── services/
    │       └── tone_drill.py # Sampling & ML logic
    └── audio/vi_fpt/        # Pre-generated Vietnamese audio (FPT.AI)
```

### Core Flow
1. Frontend calls `POST /api/drill/next` with previous answer
2. Backend updates ML state, samples next drill
3. Frontend displays drill, plays audio
4. User selects answer → repeat

### Audio System
- Pre-generated MP3 files via FPT.AI TTS (Vietnamese "banmai" voice)
- Files stored in `backend/audio/vi_fpt/`
- Naming: `{word_id}_{slug}.mp3`
- **No fallbacks**: If FPT audio file is missing, an error is raised. Never use browser speech synthesis or other TTS as fallback.

### ML Layer Architecture
The backend handles all business logic:
- Tone confusion tracking via Beta-Bernoulli model
- Difficulty progression: 2-choice → mixed → 4-choice
- Adaptive sampling based on confusion probabilities

All ML state is derivable from the sequence of user actions (drill presentations, answers given).

## Target Languages

Vietnamese (implemented)

## Terminology

"Word" is used interchangeably with "n-gram" throughout the codebase.
