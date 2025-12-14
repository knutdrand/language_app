from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pathlib import Path

from app.tts import get_audio_path, ensure_audio_exists, slugify, AUDIO_DIR

router = APIRouter()


@router.get("/audio/{language}/{slug}")
async def get_audio(language: str, slug: str):
    """
    Get audio file for a word.

    The slug should be the slugified version of the word.
    Example: "con mèo" -> "con_meo"
    """
    audio_path = AUDIO_DIR / language / f"{slug}.wav"

    if not audio_path.exists():
        raise HTTPException(status_code=404, detail=f"Audio not found: {slug}")

    return FileResponse(
        audio_path,
        media_type="audio/wav",
        filename=f"{slug}.wav",
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
