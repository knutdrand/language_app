#!/usr/bin/env python3
"""
Test script for Vietnamese ASR tone recognition.

Uses existing audio files from the app to test transcription accuracy.
"""
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))

import soundfile as sf
import numpy as np


def test_transcriber():
    """Test the transcriber with existing audio files."""
    from app.services.asr.transcriber import (
        transcribe_audio,
        check_tone_match,
        SAMPLE_RATE,
    )

    # Find audio files
    audio_dir = Path(__file__).parent.parent / "audio" / "vi"

    if not audio_dir.exists():
        print(f"Audio directory not found: {audio_dir}")
        return

    # Get a few test files
    wav_files = list(audio_dir.glob("*.wav"))[:5]

    if not wav_files:
        print("No WAV files found")
        return

    print(f"Testing with {len(wav_files)} audio files...\n")

    for wav_file in wav_files:
        # Expected text is the filename (without extension)
        expected = wav_file.stem.replace("_", " ")

        # Load audio
        audio, sr = sf.read(wav_file)

        # Resample if needed
        if sr != SAMPLE_RATE:
            import librosa
            audio = librosa.resample(audio.astype(np.float32), orig_sr=sr, target_sr=SAMPLE_RATE)

        # Transcribe
        result = transcribe_audio(audio.astype(np.float32))

        # Check match
        match = check_tone_match(result.text, expected, strict=False)

        print(f"File: {wav_file.name}")
        print(f"  Expected:     {expected}")
        print(f"  Transcribed:  {result.text}")
        print(f"  Tone match:   {'✓' if match['tone_match'] else '✗'}")
        print(f"  Text match:   {'✓' if match['text_match'] else '✗'}")
        if match['positions']:
            print(f"  Tones: expected={match['expected_tones']}, got={match['transcribed_tones']}")
        print()


def test_with_recording():
    """Interactive test - record and check pronunciation."""
    print("Interactive test not yet implemented.")
    print("Use the API endpoint POST /api/asr/check-tone instead.")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Test Vietnamese ASR")
    parser.add_argument("--interactive", "-i", action="store_true", help="Interactive recording mode")
    args = parser.parse_args()

    if args.interactive:
        test_with_recording()
    else:
        test_transcriber()
