from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from pathlib import Path
from typing import Literal

from app.tts import get_audio_path, ensure_audio_exists, slugify, AUDIO_DIR

router = APIRouter()

# Available TTS providers
TTS_PROVIDERS = {
    "piper": {"dir": "vi", "ext": "wav", "media_type": "audio/wav"},
    "fpt": {"dir": "vi_fpt", "ext": "mp3", "media_type": "audio/mpeg"},
}
DEFAULT_PROVIDER = "fpt"


@router.get("/audio/{language}/{slug}")
async def get_audio(
    language: str,
    slug: str,
    provider: Literal["piper", "fpt"] = Query(default=DEFAULT_PROVIDER),
):
    """
    Get audio file for a word.

    The slug should be the slugified version of the word.
    Example: "con mèo" -> "con_meo"

    Providers:
    - fpt: FPT.AI TTS (higher quality, MP3)
    - piper: Piper TTS (local, WAV)
    """
    config = TTS_PROVIDERS.get(provider, TTS_PROVIDERS[DEFAULT_PROVIDER])

    # For FPT, use vi_fpt directory; for piper, use vi
    if provider == "fpt":
        audio_path = AUDIO_DIR / "vi_fpt" / f"{slug}.mp3"
    else:
        audio_path = AUDIO_DIR / language / f"{slug}.wav"

    if not audio_path.exists():
        # Fallback to other provider
        fallback = "piper" if provider == "fpt" else "fpt"
        fallback_config = TTS_PROVIDERS[fallback]
        if fallback == "fpt":
            fallback_path = AUDIO_DIR / "vi_fpt" / f"{slug}.mp3"
        else:
            fallback_path = AUDIO_DIR / language / f"{slug}.wav"

        if fallback_path.exists():
            audio_path = fallback_path
            config = fallback_config
        else:
            raise HTTPException(status_code=404, detail=f"Audio not found: {slug}")

    return FileResponse(
        audio_path,
        media_type=config["media_type"],
        filename=f"{slug}.{config['ext']}",
    )


@router.post("/audio/generate")
async def generate_audio_endpoint(text: str, language: str = "vi"):
    """
    Generate audio for a word on-demand.

    This is useful for words not in the pre-generated set.
    """
    audio_path = ensure_audio_exists(text, language)

    if audio_path is None:
        raise HTTPException(
            status_code=500,
            detail="Failed to generate audio. Check if Piper model is installed."
        )

    slug = slugify(text)
    return {
        "text": text,
        "slug": slug,
        "audio_url": f"/audio/{language}/{slug}.wav",
    }


@router.get("/audio/list/{language}")
async def list_audio(language: str):
    """List all available audio files for a language."""
    lang_dir = AUDIO_DIR / language

    if not lang_dir.exists():
        return {"files": []}

    files = [f.stem for f in lang_dir.glob("*.wav")]
    return {"language": language, "count": len(files), "files": files}
