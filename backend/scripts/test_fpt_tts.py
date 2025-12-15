#!/usr/bin/env python3
"""
Test script for FPT.AI Text-to-Speech API.

Usage:
    export FPT_API_KEY="your_api_key"
    python scripts/test_fpt_tts.py "Xin chào"
"""

import os
import sys
import time
import requests
from pathlib import Path

# FPT.AI TTS API endpoint
FPT_TTS_ENDPOINT = "https://api.fpt.ai/hmi/tts/v5"

# Available voices
VOICES = {
    "banmai": "Northern female",
    "leminh": "Northern male",
    "thuminh": "Northern female",
    "myan": "Northern female",
    "lannhi": "Southern female",
    "linhsan": "Southern female",
    "minhquang": "Northern male",
}

DEFAULT_VOICE = "banmai"


def generate_audio_fpt(
    text: str,
    api_key: str,
    voice: str = DEFAULT_VOICE,
    speed: str = "0",  # -3 to 3, 0 is normal
) -> dict:
    """
    Call FPT.AI TTS API to generate audio.

    Returns dict with 'async' URL that needs polling, or 'error'.
    """
    headers = {
        "api-key": api_key,
        "voice": voice,
        "speed": speed,
    }

    response = requests.post(
        FPT_TTS_ENDPOINT,
        headers=headers,
        data=text.encode("utf-8"),
    )

    if response.status_code != 200:
        return {"error": f"API error: {response.status_code} - {response.text}"}

    return response.json()


def download_audio(url: str, output_path: Path, max_retries: int = 10) -> bool:
    """
    Download audio from FPT.AI URL with retry logic.

    The audio file may not be ready immediately, so we retry.
    """
    for attempt in range(max_retries):
        try:
            response = requests.get(url, timeout=10)
            if response.status_code == 200:
                output_path.parent.mkdir(parents=True, exist_ok=True)
                output_path.write_bytes(response.content)
                return True
            elif response.status_code == 404:
                # File not ready yet, wait and retry
                print(f"  Audio not ready, waiting... (attempt {attempt + 1}/{max_retries})")
                time.sleep(2)
            else:
                print(f"  Download error: {response.status_code}")
                return False
        except requests.RequestException as e:
            print(f"  Request error: {e}")
            time.sleep(2)

    return False


def main():
    # Get API key from environment
    api_key = os.environ.get("FPT_API_KEY")
    if not api_key:
        print("Error: Set FPT_API_KEY environment variable")
        print("Get your API key from: https://voicemaker.fpt.ai/")
        sys.exit(1)

    # Get text from argument or use default
    text = sys.argv[1] if len(sys.argv) > 1 else "Xin chào, tôi là trợ lý ảo"
    voice = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_VOICE

    print(f"Text: {text}")
    print(f"Voice: {voice} ({VOICES.get(voice, 'unknown')})")
    print()

    # Call API
    print("Calling FPT.AI TTS API...")
    result = generate_audio_fpt(text, api_key, voice)

    # error: 0 means success in FPT.AI API
    if result.get("error") not in (0, "0"):
        print(f"Error: {result.get('error')} - {result.get('message', 'Unknown error')}")
        sys.exit(1)

    print(f"API Response: {result}")
    print()

    # Get the async URL (audio may take time to generate)
    audio_url = result.get("async")
    if not audio_url:
        print("No audio URL in response")
        sys.exit(1)

    # Download the audio
    output_dir = Path(__file__).parent.parent / "audio" / "fpt_test"
    output_file = output_dir / f"test_{voice}.mp3"

    print(f"Downloading audio from: {audio_url}")
    if download_audio(audio_url, output_file):
        print(f"Audio saved to: {output_file}")
        print(f"\nPlay with: afplay {output_file}")
    else:
        print("Failed to download audio")
        sys.exit(1)


if __name__ == "__main__":
    main()
