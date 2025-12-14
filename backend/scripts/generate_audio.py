#!/usr/bin/env python3
"""
Batch generate audio files for all words in the vocabulary.

Usage:
    python scripts/generate_audio.py

This script reads words.json from the frontend and generates
WAV audio files for each Vietnamese word using Piper TTS.
"""

import json
import sys
from pathlib import Path

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.tts import generate_audio, get_audio_path, slugify, MODELS_DIR, AUDIO_DIR


def download_model():
    """Download the Vietnamese voice model if not present."""
    import subprocess

    model_path = MODELS_DIR / "vi_VN-vivos-x_low.onnx"
    if model_path.exists():
        print(f"Model already exists: {model_path}")
        return True

    print("Downloading Vietnamese voice model...")
    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    try:
        # Use piper to download the model
        result = subprocess.run(
            [
                "piper",
                "--model", "vi_VN-vivos-x_low",
                "--download-dir", str(MODELS_DIR),
                "--update-voices",
            ],
            input="test",  # Dummy input to trigger download
            capture_output=True,
            text=True,
        )

        # Check if model was downloaded
        if model_path.exists():
            print(f"Model downloaded to: {model_path}")
            return True
        else:
            print(f"Download may have failed. Stderr: {result.stderr}")
            print("\nTry manually downloading from:")
            print("https://huggingface.co/rhasspy/piper-voices/tree/main/vi/vi_VN/vivos/x_low")
            return False

    except FileNotFoundError:
        print("Piper not found. Install with: pip install piper-tts")
        return False


def load_words() -> list[dict]:
    """Load words from the frontend words.json file."""
    words_path = Path(__file__).parent.parent.parent / "frontend" / "src" / "data" / "words.json"

    if not words_path.exists():
        print(f"Words file not found: {words_path}")
        return []

    with open(words_path, "r", encoding="utf-8") as f:
        return json.load(f)


def main():
    print("=" * 50)
    print("Batch Audio Generation for Vietnamese Vocabulary")
    print("=" * 50)

    # Ensure model is available
    if not download_model():
        print("\nCannot proceed without voice model.")
        sys.exit(1)

    # Load words
    words = load_words()
    if not words:
        print("No words to process.")
        sys.exit(1)

    print(f"\nFound {len(words)} words to process")

    # Ensure output directory exists
    output_dir = AUDIO_DIR / "vi"
    output_dir.mkdir(parents=True, exist_ok=True)

    # Generate audio for each word
    success_count = 0
    skip_count = 0
    fail_count = 0

    for i, word in enumerate(words, 1):
        vietnamese = word["vietnamese"]
        english = word["english"]
        slug = slugify(vietnamese)
        output_path = output_dir / f"{slug}.wav"

        # Skip if already exists
        if output_path.exists():
            print(f"[{i}/{len(words)}] Skip (exists): {vietnamese} -> {slug}.wav")
            skip_count += 1
            continue

        print(f"[{i}/{len(words)}] Generating: {vietnamese} ({english}) -> {slug}.wav")

        if generate_audio(vietnamese, output_path):
            success_count += 1
        else:
            fail_count += 1
            print(f"  FAILED: {vietnamese}")

    print("\n" + "=" * 50)
    print(f"Results:")
    print(f"  Generated: {success_count}")
    print(f"  Skipped (existing): {skip_count}")
    print(f"  Failed: {fail_count}")
    print(f"  Total: {len(words)}")
    print("=" * 50)


if __name__ == "__main__":
    main()
