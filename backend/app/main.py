from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from app.routers import audio, attempts, fsrs, auth, sync
from app.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database on startup."""
    await init_db()
    yield


app = FastAPI(
    title="Language App API",
    description="Backend for Vietnamese vocabulary learning app",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8081",  # Expo default
        "http://localhost:8082",  # Expo alternate
        "http://127.0.0.1:8081",
        "http://127.0.0.1:8082",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static audio files
audio_dir = Path(__file__).parent.parent / "audio"
if audio_dir.exists():
    app.mount("/audio", StaticFiles(directory=str(audio_dir)), name="audio")

# Include routers
app.include_router(audio.router, prefix="/api", tags=["audio"])
app.include_router(attempts.router, prefix="/api", tags=["attempts"])
app.include_router(fsrs.router, prefix="/api", tags=["fsrs"])
app.include_router(auth.router)  # Auth router has its own /api/auth prefix
app.include_router(sync.router, prefix="/api", tags=["sync"])


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
