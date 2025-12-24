from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from app.routers import audio, auth, sync, asr, drill
from app.database import init_db
from app.config import get_settings


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

# CORS - configurable via ALLOWED_ORIGINS env var
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
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
app.include_router(auth.router)  # Auth router has its own /api/auth prefix
app.include_router(sync.router, prefix="/api", tags=["sync"])
app.include_router(asr.router, prefix="/api", tags=["asr"])
app.include_router(drill.router, prefix="/api", tags=["drill"])


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
