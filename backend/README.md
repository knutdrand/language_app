# Language App Backend

FastAPI backend for a Vietnamese language learning application focused on listening comprehension and tone/vowel discrimination.

## Features

- **Tone & Vowel Drills**: Adaptive difficulty system using confusion matrices and Bradley-Terry/Luce choice models
- **Spaced Repetition**: FSRS-based scheduling for optimal review timing
- **Text-to-Speech**: Piper TTS for Vietnamese audio generation (with FPT.AI support)
- **Speech Recognition**: ASR endpoint for pronunciation feedback
- **User Authentication**: JWT-based auth with SQLite/PostgreSQL storage

## Quick Start

### Using uv (recommended)

```bash
# Install dependencies
uv sync

# Install with dev dependencies (pyright, pytest)
uv sync --extra dev

# Run the server
uv run uvicorn app.main:app --reload --port 8001
```

### Using pip

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Key environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `SECRET_KEY` | JWT signing key | (required) |
| `DATABASE_URL` | Database connection string | `sqlite+aiosqlite:///./app.db` |
| `ALLOWED_ORIGINS` | CORS origins (comma-separated) | `http://localhost:5173` |

## Project Structure

```
backend/
├── app/
│   ├── main.py              # FastAPI app entry point
│   ├── config.py            # Settings via pydantic-settings
│   ├── database.py          # Async SQLAlchemy setup
│   ├── tts.py               # Piper TTS wrapper
│   ├── auth/                # JWT authentication
│   │   ├── jwt.py
│   │   ├── password.py
│   │   └── dependencies.py
│   ├── models/              # SQLModel database models
│   │   ├── user.py
│   │   ├── progress.py
│   │   └── ml.py
│   ├── ml/                  # Machine learning layer
│   │   ├── types.py         # Problem, Answer, ConfusionState
│   │   ├── luce_service.py  # Luce/Bradley-Terry models
│   │   ├── registry.py      # Problem type configuration
│   │   └── beta_utils.py    # Beta distribution utilities
│   ├── services/            # Business logic
│   │   ├── tone_drill.py    # Tone discrimination drills
│   │   ├── vowel_drill.py   # Vowel discrimination drills
│   │   ├── drill.py         # Unified drill orchestration
│   │   └── state_persistence.py
│   └── routers/             # API endpoints
│       ├── audio.py         # TTS audio serving
│       ├── drill.py         # Unified drill API
│       ├── auth.py          # Login/register
│       ├── asr.py           # Speech recognition
│       └── ...
├── audio/                   # Pre-generated audio files
│   ├── vi/                  # Piper TTS (WAV)
│   └── vi_fpt/              # FPT.AI TTS (MP3)
├── models/                  # Piper voice models (.onnx)
├── scripts/                 # Utility scripts
│   └── generate_audio.py    # Batch audio generation
├── tests/                   # Pytest tests
├── pyproject.toml           # Project configuration
└── requirements.txt         # Legacy pip requirements
```

## API Endpoints

### Drills

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/drill/next` | Get next drill, submit previous answer |
| GET | `/api/drill/stats` | Get current mastery statistics |

### Audio

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/audio/{lang}/{slug}` | Get audio file for word |
| POST | `/api/audio/generate` | Generate audio on-demand |
| GET | `/api/audio/list/{lang}` | List available audio files |

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create new user |
| POST | `/api/auth/login` | Get access token |
| GET | `/api/auth/me` | Get current user info |

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |

## ML Architecture

The drill system uses a confusion matrix approach with Bradley-Terry/Luce choice models:

1. **Confusion State**: Tracks `counts[played][selected]` for each class pair
2. **Success Probability**: Computed via Luce formula with Laplace smoothing
3. **Adaptive Sampling**: Weights drill selection by error probability
4. **Difficulty Progression**: 2-choice → 4-choice → multi-syllable

All ML state is derivable by replaying user action logs (no hidden state).

## Development

### Type Checking

```bash
uv run pyright app/
```

### Testing

```bash
uv run pytest
```

### Generate Audio

```bash
uv run python scripts/generate_audio.py
```

## Requirements

- Python 3.10+
- FFmpeg (for audio format conversion)
- Piper voice model: `vi_VN-vivos-x_low` (place in `models/`)
