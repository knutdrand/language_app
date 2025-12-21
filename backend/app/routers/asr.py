"""
ASR router - API endpoints for tone recognition via speech.
"""
import io
import numpy as np
from typing import Annotated
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel

router = APIRouter()


class ToneCheckResult(BaseModel):
    """Result of tone pronunciation check."""
    is_correct: bool
    text_match: bool
    tone_match: bool
    transcription: str
    expected: str
    transcribed_tones: list[int]
    expected_tones: list[int]
    positions: list[dict]


@router.post("/asr/check-tone", response_model=ToneCheckResult)
async def check_tone_pronunciation(
    audio: Annotated[UploadFile, File(description="Audio file (WAV, 16kHz mono)")],
    expected: Annotated[str, Form(description="Expected Vietnamese text")],
    strict: Annotated[bool, Form(description="Require exact text match")] = False,
):
    """
    Check if the user's pronunciation has correct tones.

    Upload an audio file of the user speaking, along with the expected text.
    Returns whether the tones match.
    """
    import soundfile as sf
    import librosa
    from app.services.asr.transcriber import (
        transcribe_audio,
        check_tone_match,
        SAMPLE_RATE,
    )

    # Read audio file
    try:
        audio_bytes = await audio.read()
        audio_data, sample_rate = sf.read(io.BytesIO(audio_bytes))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read audio file: {e}")

    # Convert to mono if stereo
    if len(audio_data.shape) > 1:
        audio_data = audio_data.mean(axis=1)

    # Resample to 16kHz if needed
    if sample_rate != SAMPLE_RATE:
        audio_data = librosa.resample(
            audio_data.astype(np.float32),
            orig_sr=sample_rate,
            target_sr=SAMPLE_RATE
        )

    # Normalize to [-1, 1]
    if audio_data.max() > 1.0 or audio_data.min() < -1.0:
        audio_data = audio_data / max(abs(audio_data.max()), abs(audio_data.min()))

    # Transcribe
    try:
        result = transcribe_audio(audio_data.astype(np.float32))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {e}")

    # Check tone match
    match_result = check_tone_match(result.text, expected, strict=strict)

    return ToneCheckResult(**match_result)


@router.post("/asr/transcribe")
async def transcribe_audio_endpoint(
    audio: Annotated[UploadFile, File(description="Audio file (WAV, 16kHz mono)")],
):
    """
    Transcribe Vietnamese audio to text.

    Returns the transcribed text with tones.
    """
    import soundfile as sf
    import librosa
    from app.services.asr.transcriber import transcribe_audio, SAMPLE_RATE

    # Read audio file
    try:
        audio_bytes = await audio.read()
        audio_data, sample_rate = sf.read(io.BytesIO(audio_bytes))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read audio file: {e}")

    # Convert to mono if stereo
    if len(audio_data.shape) > 1:
        audio_data = audio_data.mean(axis=1)

    # Resample to 16kHz if needed
    if sample_rate != SAMPLE_RATE:
        audio_data = librosa.resample(
            audio_data.astype(np.float32),
            orig_sr=sample_rate,
            target_sr=SAMPLE_RATE
        )

    # Normalize
    if audio_data.max() > 1.0 or audio_data.min() < -1.0:
        audio_data = audio_data / max(abs(audio_data.max()), abs(audio_data.min()))

    # Transcribe
    try:
        result = transcribe_audio(audio_data.astype(np.float32))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {e}")

    return {
        "transcription": result.text,
        "confidence": result.confidence,
    }
