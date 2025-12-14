import wave
import subprocess
from pathlib import Path
from typing import Optional

# Path to voice model
MODELS_DIR = Path(__file__).parent.parent / "models"
AUDIO_DIR = Path(__file__).parent.parent / "audio"

# Vietnamese voice model name
VOICE_MODEL = "vi_VN-vivos-x_low"


def get_model_path() -> Path:
    """Get path to the voice model ONNX file."""
    return MODELS_DIR / f"{VOICE_MODEL}.onnx"


def get_model_config_path() -> Path:
    """Get path to the voice model config JSON file."""
    return MODELS_DIR / f"{VOICE_MODEL}.onnx.json"


def slugify(text: str) -> str:
    """Convert Vietnamese text to a safe filename slug."""
    import unicodedata
    # Normalize unicode
    text = unicodedata.normalize('NFD', text)
    # Remove diacritics for filename but keep the original for TTS
    slug = text.lower()
    # Replace spaces with underscores
    slug = slug.replace(' ', '_')
    # Keep only alphanumeric and underscores
    slug = ''.join(c for c in slug if c.isalnum() or c == '_')
    return slug


def generate_audio(text: str, output_path: Path, voice_model: Optional[str] = None) -> bool:
    """
    Generate audio file from text using Piper TTS.

    Args:
        text: Vietnamese text to synthesize
        output_path: Path to save the WAV file
        voice_model: Optional voice model name (defaults to VOICE_MODEL)

    Returns:
        True if successful, False otherwise
    """
    model = voice_model or VOICE_MODEL
    model_path = MODELS_DIR / f"{model}.onnx"

    if not model_path.exists():
        print(f"Model not found: {model_path}")
        print("Download it with: piper --download-dir models --model vi_VN-vivos-x_low")
        return False

    # Ensure output directory exists
    output_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        # Use piper CLI to generate audio
        result = subprocess.run(
            [
                "piper",
                "--model", str(model_path),
                "--output_file", str(output_path),
            ],
            input=text,
            capture_output=True,
            text=True,
        )

        if result.returncode != 0:
            print(f"Piper error: {result.stderr}")
            return False

        return output_path.exists()

    except FileNotFoundError:
        print("Piper not found. Install with: pip install piper-tts")
        return False
    except Exception as e:
        print(f"Error generating audio: {e}")
        return False


def get_audio_path(text: str, language: str = "vi") -> Path:
    """Get the path where audio for this text should be stored."""
    slug = slugify(text)
    return AUDIO_DIR / language / f"{slug}.wav"


def ensure_audio_exists(text: str, language: str = "vi") -> Optional[Path]:
    """
    Ensure audio file exists for the given text, generating if needed.

    Returns the path to the audio file, or None if generation failed.
    """
    audio_path = get_audio_path(text, language)

    if audio_path.exists():
        return audio_path

    # Generate on-demand
    if generate_audio(text, audio_path):
        return audio_path

    return None
