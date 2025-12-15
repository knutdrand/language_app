#!/usr/bin/env python3
"""
Fetch Vietnamese transcripts from YouTube videos.

Usage:
    python scripts/fetch_youtube_transcript.py VIDEO_ID
    python scripts/fetch_youtube_transcript.py VIDEO_ID --output transcript.txt
    python scripts/fetch_youtube_transcript.py VIDEO_ID --extract-vocab
"""

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

from youtube_transcript_api import YouTubeTranscriptApi


def get_video_id(url_or_id: str) -> str:
    """Extract video ID from URL or return as-is if already an ID."""
    # Handle full URLs
    patterns = [
        r'youtube\.com/watch\?v=([^&]+)',
        r'youtu\.be/([^?]+)',
        r'youtube\.com/embed/([^?]+)',
    ]
    for pattern in patterns:
        match = re.search(pattern, url_or_id)
        if match:
            return match.group(1)
    # Assume it's already a video ID
    return url_or_id


def list_transcripts(video_id: str) -> list:
    """List all available transcripts for a video."""
    ytt = YouTubeTranscriptApi()
    try:
        transcript_list = ytt.list(video_id)
        return [
            {
                "language": t.language,
                "code": t.language_code,
                "auto_generated": t.is_generated,
            }
            for t in transcript_list
        ]
    except Exception as e:
        print(f"Error listing transcripts: {e}", file=sys.stderr)
        return []


def fetch_transcript(video_id: str, language_code: str = "vi") -> list:
    """Fetch transcript for a video in the specified language."""
    ytt = YouTubeTranscriptApi()
    try:
        transcript_list = ytt.list(video_id)

        # Find matching transcript
        for t in transcript_list:
            if t.language_code == language_code or language_code in t.language_code:
                return t.fetch()

        # Try Vietnamese variants
        if language_code == "vi":
            for t in transcript_list:
                if "viet" in t.language.lower():
                    return t.fetch()

        print(f"No {language_code} transcript found", file=sys.stderr)
        return []
    except Exception as e:
        print(f"Error fetching transcript: {e}", file=sys.stderr)
        return []


def extract_text(transcript: list) -> str:
    """Extract plain text from transcript segments."""
    lines = []
    for seg in transcript:
        text = seg.text
        # Clean up music markers but keep them for context
        lines.append(text)
    return "\n".join(lines)


def extract_vocabulary(transcript: list) -> list:
    """Extract unique Vietnamese words/phrases from transcript."""
    all_text = " ".join(seg.text for seg in transcript)

    # Remove music markers and special characters
    all_text = re.sub(r'♪|[\[\]]', '', all_text)
    all_text = re.sub(r'[^\w\sàáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ]', '', all_text.lower())

    # Split into words
    words = all_text.split()

    # Count frequency
    word_counts = Counter(words)

    # Filter out very short words and common fillers
    fillers = {'và', 'là', 'của', 'có', 'được', 'để', 'trong', 'với', 'cho', 'này', 'đó', 'thì', 'mà', 'như', 'nếu', 'khi', 'từ', 'ra', 'vào', 'lên', 'xuống'}

    vocab = [
        {"word": word, "count": count}
        for word, count in word_counts.most_common(100)
        if len(word) >= 2 and word not in fillers
    ]

    return vocab


def main():
    parser = argparse.ArgumentParser(description="Fetch Vietnamese YouTube transcripts")
    parser.add_argument("video", help="YouTube video ID or URL")
    parser.add_argument("--language", "-l", default="vi", help="Language code (default: vi)")
    parser.add_argument("--list", action="store_true", help="List available transcripts")
    parser.add_argument("--output", "-o", help="Output file path")
    parser.add_argument("--extract-vocab", action="store_true", help="Extract vocabulary list")
    parser.add_argument("--json", action="store_true", help="Output as JSON")

    args = parser.parse_args()

    video_id = get_video_id(args.video)
    print(f"Video ID: {video_id}", file=sys.stderr)

    if args.list:
        transcripts = list_transcripts(video_id)
        print("\nAvailable transcripts:")
        for t in transcripts:
            auto = "(auto)" if t["auto_generated"] else "(manual)"
            print(f"  - {t['language']} ({t['code']}) {auto}")
        return

    # Fetch transcript
    transcript = fetch_transcript(video_id, args.language)
    if not transcript:
        print("No transcript found", file=sys.stderr)
        sys.exit(1)

    print(f"Fetched {len(transcript)} segments", file=sys.stderr)

    if args.extract_vocab:
        vocab = extract_vocabulary(transcript)
        if args.json:
            output = json.dumps(vocab, ensure_ascii=False, indent=2)
        else:
            output = "\n".join(f"{v['word']}: {v['count']}" for v in vocab)
    else:
        if args.json:
            output = json.dumps(
                [{"text": s.text, "start": s.start, "duration": s.duration} for s in transcript],
                ensure_ascii=False,
                indent=2
            )
        else:
            output = extract_text(transcript)

    if args.output:
        Path(args.output).write_text(output, encoding="utf-8")
        print(f"Saved to {args.output}", file=sys.stderr)
    else:
        print(output)


if __name__ == "__main__":
    main()
