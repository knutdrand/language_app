#!/usr/bin/env python3
"""
Generate audio for all words using FPT.AI TTS.

Usage:
    export FPT_API_KEY="your_api_key"
    python scripts/generate_audio_fpt.py
"""

import json
import os
import sys
import time
import unicodedata
import requests
from pathlib import Path

# FPT.AI TTS API endpoint
FPT_TTS_ENDPOINT = "https://api.fpt.ai/hmi/tts/v5"
DEFAULT_VOICE = "banmai"

# Paths
SCRIPT_DIR = Path(__file__).parent
BACKEND_DIR = SCRIPT_DIR.parent
FRONTEND_DIR = BACKEND_DIR.parent / "frontend"
WORDS_FILE = FRONTEND_DIR / "src" / "data" / "words.json"
AUDIO_DIR = BACKEND_DIR / "audio" / "vi_fpt"


def slugify(text: str) -> str:
    """Convert Vietnamese text to a safe filename slug (ASCII only)."""
    text = unicodedata.normalize('NFD', text)
    slug = text.lower()
    slug = slug.replace(' ', '_')
    # Replace đ with d (NFD doesn't decompose đ)
    slug = slug.replace('đ', 'd')
    # Keep only ASCII alphanumeric and underscores
    slug = ''.join(c for c in slug if c in 'abcdefghijklmnopqrstuvwxyz0123456789_')
    return slug


def get_audio_filename(word_id: int, text: str, ext: str = "mp3") -> str:
    """Generate unique audio filename using word ID and slug.

    Format: {id}_{slug}.{ext}
    Example: 42_ban.mp3
    """
    slug = slugify(text)
    return f"{word_id}_{slug}.{ext}"


def generate_audio_fpt(text: str, api_key: str, voice: str = DEFAULT_VOICE) -> dict:
    """Call FPT.AI TTS API to generate audio.

    Note: FPT.AI requires minimum 3 characters. For short words,
    we pad with a period which doesn't affect pronunciation.
    """
    # FPT.AI requires minimum 3 characters - pad short words with period
    api_text = text if len(text) >= 3 else text + "."

    headers = {
        "api-key": api_key,
        "voice": voice,
    }
    response = requests.post(
        FPT_TTS_ENDPOINT,
        headers=headers,
        data=api_text.encode("utf-8"),
    )
    if response.status_code != 200:
        return {"error": f"API error: {response.status_code} - {response.text}"}
    return response.json()


def download_audio(url: str, output_path: Path, max_retries: int = 10) -> bool:
    """Download audio from FPT.AI URL with retry logic."""
    for attempt in range(max_retries):
        try:
            response = requests.get(url, timeout=10)
            if response.status_code == 200:
                output_path.parent.mkdir(parents=True, exist_ok=True)
                output_path.write_bytes(response.content)
                return True
            elif response.status_code == 404:
                time.sleep(1)
            else:
                return False
        except requests.RequestException:
            time.sleep(1)
    return False


def main():
    api_key = os.environ.get("FPT_API_KEY")
    if not api_key:
        print("Error: Set FPT_API_KEY environment variable")
        sys.exit(1)

    # Load words
    with open(WORDS_FILE) as f:
        words = json.load(f)

    print(f"Generating audio for {len(words)} words using FPT.AI TTS")
    print(f"Voice: {DEFAULT_VOICE}")
    print(f"Output directory: {AUDIO_DIR}")
    print()

    AUDIO_DIR.mkdir(parents=True, exist_ok=True)

    success_count = 0
    skip_count = 0
    fail_count = 0

    for i, word in enumerate(words, 1):
        word_id = word["id"]
        vietnamese = word["vietnamese"]
        filename = get_audio_filename(word_id, vietnamese, "mp3")
        output_path = AUDIO_DIR / filename

        # Skip if already exists
        if output_path.exists():
            print(f"[{i}/{len(words)}] Skipping {vietnamese} (already exists)")
            skip_count += 1
            continue

        print(f"[{i}/{len(words)}] Generating: {vietnamese} -> {filename}...", end=" ", flush=True)

        # Call API
        result = generate_audio_fpt(vietnamese, api_key)

        if result.get("error") not in (0, "0"):
            print(f"API Error: {result.get('error')}")
            fail_count += 1
            continue

        audio_url = result.get("async")
        if not audio_url:
            print("No audio URL")
            fail_count += 1
            continue

        # Download
        if download_audio(audio_url, output_path):
            print("OK")
            success_count += 1
        else:
            print("Download failed")
            fail_count += 1

        # Rate limiting - be nice to the API
        time.sleep(0.5)

    print()
    print(f"Done! Generated: {success_count}, Skipped: {skip_count}, Failed: {fail_count}")


if __name__ == "__main__":
    main()
