from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from pathlib import Path
from typing import Literal

router = APIRouter()

# Audio directory
AUDIO_DIR = Path(__file__).parent.parent.parent / "audio" / "vi_fpt"

# Available options
VOICES = Literal["banmai", "lannhi", "leminh", "myan", "thuminh", "giahuy", "linhsan"]
DEFAULT_VOICE = "banmai"
DEFAULT_SPEED = 0


def get_audio_path(slug: str, voice: str, speed: int) -> Path:
    """Get audio file path for given parameters.

    Default (banmai, 0) uses root vi_fpt directory for backward compatibility.
    Other combinations use subdirectories like vi_fpt/leminh_-1/
    """
    if voice == DEFAULT_VOICE and speed == DEFAULT_SPEED:
        return AUDIO_DIR / f"{slug}.mp3"
    return AUDIO_DIR / f"{voice}_{speed}" / f"{slug}.mp3"


@router.get("/audio/{language}/{slug}")
async def get_audio(
    language: str,
    slug: str,
    voice: VOICES = Query(default=DEFAULT_VOICE, description="Voice: banmai, lannhi, leminh, myan, thuminh, giahuy, linhsan"),
    speed: int = Query(default=DEFAULT_SPEED, ge=-3, le=3, description="Speed: -3 (slowest) to +3 (fastest)"),
) -> FileResponse:
    """
    Get audio file for a word.

    The slug should be the slugified version of the word.
    Example: "con mèo" -> "1_con_meo.mp3"

    Query parameters:
    - voice: Voice to use (default: banmai)
    - speed: Speed from -3 to +3 (default: 0)

    Audio is pre-generated using FPT.AI TTS.
    """
    audio_path = get_audio_path(slug, voice, speed)

    if not audio_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"FPT audio not found: {slug} (voice={voice}, speed={speed}). No fallbacks available."
        )

    return FileResponse(
        audio_path,
        media_type="audio/mpeg",
        filename=f"{slug}.mp3",
    )


@router.get("/audio/list/{language}")
async def list_audio(
    language: str,
    voice: VOICES = Query(default=DEFAULT_VOICE),
    speed: int = Query(default=DEFAULT_SPEED, ge=-3, le=3),
) -> dict:
    """List all available audio files for given voice/speed combination."""
    if voice == DEFAULT_VOICE and speed == DEFAULT_SPEED:
        audio_dir = AUDIO_DIR
    else:
        audio_dir = AUDIO_DIR / f"{voice}_{speed}"

    if not audio_dir.exists():
        return {"voice": voice, "speed": speed, "count": 0, "files": []}

    files = [f.stem for f in audio_dir.glob("*.mp3")]
    return {"voice": voice, "speed": speed, "count": len(files), "files": files}


@router.get("/audio/voices")
async def list_voices() -> dict:
    """List available voices and their audio counts."""
    voices = ["banmai", "lannhi", "leminh", "myan", "thuminh", "giahuy", "linhsan"]
    speeds = range(-3, 4)

    available = []

    # Check default (banmai, 0)
    default_count = len(list(AUDIO_DIR.glob("*.mp3")))
    if default_count > 0:
        available.append({"voice": "banmai", "speed": 0, "count": default_count, "default": True})

    # Check subdirectories
    for voice in voices:
        for speed in speeds:
            if voice == "banmai" and speed == 0:
                continue  # Already counted above
            subdir = AUDIO_DIR / f"{voice}_{speed}"
            if subdir.exists():
                count = len(list(subdir.glob("*.mp3")))
                if count > 0:
                    available.append({"voice": voice, "speed": speed, "count": count, "default": False})

    return {"available": available, "voices": voices, "speed_range": {"min": -3, "max": 3}}
