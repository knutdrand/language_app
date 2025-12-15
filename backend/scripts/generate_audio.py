#!/usr/bin/env python3
"""
Batch generate audio files for all words in the vocabulary.

Usage:
    python scripts/generate_audio.py [options]

Options:
    --force         Regenerate all files (don't skip existing)
    --length-scale  Speech speed (default: 1.2, higher = slower)
    --random-speakers  Use different random speakers for variety
    --speaker       Use specific speaker ID (0-64)

This script reads words.json from the frontend and generates
WAV audio files for each Vietnamese word using Piper TTS.
"""

import argparse
import json
import random
import sys
from pathlib import Path

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.tts import (
    generate_audio,
    slugify,
    get_audio_filename,
    MODELS_DIR,
    AUDIO_DIR,
    SPEAKERS,
    DEFAULT_LENGTH_SCALE,
    DEFAULT_NOISE_SCALE,
    DEFAULT_NOISE_W,
)


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


def parse_args():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description="Generate audio files for Vietnamese vocabulary"
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Regenerate all files (don't skip existing)",
    )
    parser.add_argument(
        "--length-scale",
        type=float,
        default=DEFAULT_LENGTH_SCALE,
        help=f"Speech speed - higher is slower (default: {DEFAULT_LENGTH_SCALE})",
    )
    parser.add_argument(
        "--noise-scale",
        type=float,
        default=DEFAULT_NOISE_SCALE,
        help=f"Voice variation (default: {DEFAULT_NOISE_SCALE})",
    )
    parser.add_argument(
        "--noise-w",
        type=float,
        default=DEFAULT_NOISE_W,
        help=f"Phoneme duration variation (default: {DEFAULT_NOISE_W})",
    )
    parser.add_argument(
        "--random-speakers",
        action="store_true",
        help="Use different random speakers for variety",
    )
    parser.add_argument(
        "--speaker",
        type=int,
        default=None,
        help="Use specific speaker ID (0-64)",
    )
    return parser.parse_args()


def main():
    args = parse_args()

    print("=" * 60)
    print("Batch Audio Generation for Vietnamese Vocabulary")
    print("=" * 60)
    print(f"Settings:")
    print(f"  Length scale (speed): {args.length_scale} {'(slower)' if args.length_scale > 1 else '(faster)' if args.length_scale < 1 else ''}")
    print(f"  Noise scale: {args.noise_scale}")
    print(f"  Noise W: {args.noise_w}")
    if args.random_speakers:
        print(f"  Speakers: Random (from {len(SPEAKERS)} available)")
    elif args.speaker is not None:
        print(f"  Speaker: {args.speaker}")
    else:
        print(f"  Speaker: Default")
    print(f"  Force regenerate: {args.force}")
    print("=" * 60)

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
        word_id = word["id"]
        vietnamese = word["vietnamese"]
        english = word["english"]
        filename = get_audio_filename(word_id, vietnamese, "wav")
        output_path = output_dir / filename

        # Skip if already exists (unless --force)
        if output_path.exists() and not args.force:
            print(f"[{i}/{len(words)}] Skip (exists): {vietnamese} -> {filename}")
            skip_count += 1
            continue

        # Determine speaker
        if args.random_speakers:
            speaker = random.choice(SPEAKERS)
        else:
            speaker = args.speaker

        speaker_info = f" [speaker {speaker}]" if speaker is not None else ""
        print(f"[{i}/{len(words)}] Generating: {vietnamese} ({english}) -> {filename}{speaker_info}")

        if generate_audio(
            vietnamese,
            output_path,
            length_scale=args.length_scale,
            noise_scale=args.noise_scale,
            noise_w=args.noise_w,
            speaker=speaker,
        ):
            success_count += 1
        else:
            fail_count += 1
            print(f"  FAILED: {vietnamese}")

    print("\n" + "=" * 60)
    print(f"Results:")
    print(f"  Generated: {success_count}")
    print(f"  Skipped (existing): {skip_count}")
    print(f"  Failed: {fail_count}")
    print(f"  Total: {len(words)}")
    print("=" * 60)


if __name__ == "__main__":
    main()
