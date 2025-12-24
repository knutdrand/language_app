from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pathlib import Path

router = APIRouter()

# Audio directory
AUDIO_DIR = Path(__file__).parent.parent.parent / "audio"


@router.get("/audio/{language}/{slug}")
async def get_audio(language: str, slug: str) -> FileResponse:
    """
    Get audio file for a word.

    The slug should be the slugified version of the word.
    Example: "con mèo" -> "1_con_meo.mp3"

    Audio is pre-generated using FPT.AI TTS.
    """
    audio_path = AUDIO_DIR / "vi_fpt" / f"{slug}.mp3"

    if not audio_path.exists():
        raise HTTPException(status_code=404, detail=f"Audio not found: {slug}")

    return FileResponse(
        audio_path,
        media_type="audio/mpeg",
        filename=f"{slug}.mp3",
    )


@router.get("/audio/list/{language}")
async def list_audio(language: str) -> dict:
    """List all available audio files for a language."""
    audio_dir = AUDIO_DIR / "vi_fpt"

    if not audio_dir.exists():
        return {"files": []}

    files = [f.stem for f in audio_dir.glob("*.mp3")]
    return {"language": language, "count": len(files), "files": files}
