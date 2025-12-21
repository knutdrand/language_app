"""
ASR router - API endpoints for tone recognition via speech.
"""
import io
import tempfile
import numpy as np
from typing import Annotated
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel

router = APIRouter()


def convert_audio_to_wav(audio_bytes: bytes, filename: str) -> tuple[np.ndarray, int]:
    """
    Convert audio bytes to numpy array, handling various formats via pydub/ffmpeg.
    Returns (audio_data, sample_rate).
    """
    import soundfile as sf

    # First try soundfile directly (works for WAV, FLAC, OGG)
    try:
        audio_data, sample_rate = sf.read(io.BytesIO(audio_bytes))
        return audio_data, sample_rate
    except Exception:
        pass

    # Fall back to pydub for other formats (webm, mp3, etc.)
    try:
        from pydub import AudioSegment

        # Determine format from filename extension
        ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else 'webm'

        # Load with pydub (requires ffmpeg)
        audio_segment = AudioSegment.from_file(io.BytesIO(audio_bytes), format=ext)

        # Convert to mono, 16kHz
        audio_segment = audio_segment.set_channels(1).set_frame_rate(16000)

        # Get raw samples as numpy array
        samples = np.array(audio_segment.get_array_of_samples(), dtype=np.float32)

        # Normalize to [-1, 1]
        samples = samples / (2 ** 15)  # 16-bit audio

        return samples, 16000
    except Exception as e:
        raise ValueError(f"Could not convert audio: {e}")


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
    import librosa
    from app.services.asr.transcriber import (
        transcribe_audio,
        check_tone_match,
        SAMPLE_RATE,
    )

    # Read and convert audio file
    try:
        audio_bytes = await audio.read()
        audio_data, sample_rate = convert_audio_to_wav(audio_bytes, audio.filename or "recording.webm")
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
    max_val = max(abs(audio_data.max()), abs(audio_data.min()))
    if max_val > 1.0:
        audio_data = audio_data / max_val

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
    import librosa
    from app.services.asr.transcriber import transcribe_audio, SAMPLE_RATE

    # Read and convert audio file
    try:
        audio_bytes = await audio.read()
        audio_data, sample_rate = convert_audio_to_wav(audio_bytes, audio.filename or "recording.webm")
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
    max_val = max(abs(audio_data.max()), abs(audio_data.min()))
    if max_val > 1.0:
        audio_data = audio_data / max_val

    # Transcribe
    try:
        result = transcribe_audio(audio_data.astype(np.float32))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {e}")

    return {
        "transcription": result.text,
        "confidence": result.confidence,
    }
