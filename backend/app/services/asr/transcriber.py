"""
Vietnamese ASR transcriber using wav2vec2.

Uses the nguyenvulebinh/wav2vec2-base-vietnamese-250h model from HuggingFace
to transcribe Vietnamese audio and extract tones for comparison.
"""
import torch
import numpy as np
from typing import Optional
from dataclasses import dataclass
import unicodedata

# Lazy load to avoid import overhead
_processor = None
_model = None

MODEL_ID = "nguyenvulebinh/wav2vec2-base-vietnamese-250h"
SAMPLE_RATE = 16000  # Required by wav2vec2


@dataclass
class TranscriptionResult:
    """Result of transcription."""
    text: str
    confidence: float  # Placeholder for now


def get_model():
    """Lazy load the wav2vec2 model and processor."""
    global _processor, _model

    if _processor is None or _model is None:
        from transformers import Wav2Vec2Processor, Wav2Vec2ForCTC

        print(f"Loading model {MODEL_ID}...")
        _processor = Wav2Vec2Processor.from_pretrained(MODEL_ID)
        _model = Wav2Vec2ForCTC.from_pretrained(MODEL_ID)
        _model.eval()

        # Use MPS if available (Apple Silicon), else CPU
        if torch.backends.mps.is_available():
            _model = _model.to("mps")
        print("Model loaded.")

    return _processor, _model


def transcribe_audio(audio: np.ndarray, sample_rate: int = SAMPLE_RATE) -> TranscriptionResult:
    """
    Transcribe Vietnamese audio to text.

    Args:
        audio: Audio waveform as numpy array (mono, float32, normalized to [-1, 1])
        sample_rate: Sample rate of audio (must be 16kHz for wav2vec2)

    Returns:
        TranscriptionResult with transcribed text
    """
    if sample_rate != SAMPLE_RATE:
        raise ValueError(f"Sample rate must be {SAMPLE_RATE}Hz, got {sample_rate}Hz")

    processor, model = get_model()

    # Prepare input
    inputs = processor(
        audio,
        sampling_rate=sample_rate,
        return_tensors="pt",
        padding=True
    )

    # Move to same device as model
    device = next(model.parameters()).device
    input_values = inputs.input_values.to(device)

    # Transcribe
    with torch.no_grad():
        logits = model(input_values).logits

    # Decode
    predicted_ids = torch.argmax(logits, dim=-1)
    transcription = processor.batch_decode(predicted_ids)[0]

    return TranscriptionResult(
        text=transcription.strip().lower(),
        confidence=1.0  # TODO: compute actual confidence
    )


def normalize_vietnamese(text: str) -> str:
    """Normalize Vietnamese text for comparison (lowercase, NFC normalization)."""
    return unicodedata.normalize("NFC", text.lower().strip())


def extract_tones_from_text(text: str) -> list[int]:
    """
    Extract tone sequence from Vietnamese text.

    Returns list of tone IDs (1-6) for each syllable.
    Uses the same tone detection as the main app.
    """
    from app.services.drill import get_tone_sequence

    return get_tone_sequence(text)


def check_tone_match(
    transcription: str,
    expected: str,
    strict: bool = True
) -> dict:
    """
    Check if the transcribed tones match the expected tones.

    Args:
        transcription: What the ASR model heard
        expected: What the user was supposed to say
        strict: If True, require exact text match; if False, only compare tones

    Returns:
        Dict with match result and details
    """
    trans_normalized = normalize_vietnamese(transcription)
    expected_normalized = normalize_vietnamese(expected)

    trans_tones = extract_tones_from_text(trans_normalized)
    expected_tones = extract_tones_from_text(expected_normalized)

    # Exact text match
    text_match = trans_normalized == expected_normalized

    # Tone sequence match (more lenient)
    tone_match = trans_tones == expected_tones

    # Per-position comparison
    position_results = []
    for i, (t, e) in enumerate(zip(trans_tones, expected_tones)):
        position_results.append({
            "position": i,
            "expected_tone": e,
            "transcribed_tone": t,
            "match": t == e
        })

    return {
        "text_match": text_match,
        "tone_match": tone_match,
        "transcription": trans_normalized,
        "expected": expected_normalized,
        "transcribed_tones": trans_tones,
        "expected_tones": expected_tones,
        "positions": position_results,
        "is_correct": text_match if strict else tone_match
    }


# Test function
if __name__ == "__main__":
    import soundfile as sf
    import sys

    if len(sys.argv) < 3:
        print("Usage: python transcriber.py <audio_file.wav> <expected_text>")
        sys.exit(1)

    audio_file = sys.argv[1]
    expected = sys.argv[2]

    # Load audio
    audio, sr = sf.read(audio_file)
    if sr != SAMPLE_RATE:
        print(f"Warning: Resampling from {sr}Hz to {SAMPLE_RATE}Hz")
        import librosa
        audio = librosa.resample(audio, orig_sr=sr, target_sr=SAMPLE_RATE)

    # Transcribe
    result = transcribe_audio(audio)
    print(f"Transcription: {result.text}")

    # Check match
    match_result = check_tone_match(result.text, expected)
    print(f"Expected: {expected}")
    print(f"Tone match: {match_result['tone_match']}")
    print(f"Text match: {match_result['text_match']}")
    print(f"Details: {match_result['positions']}")
