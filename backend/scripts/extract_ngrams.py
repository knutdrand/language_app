#!/usr/bin/env python3
"""
Extract n-grams (1,2,3,4) from Vietnamese transcripts.

Usage:
    python scripts/extract_ngrams.py corpus/VIDEO_ID.txt --output corpus/VIDEO_ID_ngrams.json
"""

import argparse
import json
import re
from collections import Counter
from pathlib import Path


def clean_text(text: str) -> str:
    """Clean and normalize Vietnamese text."""
    # Remove music markers and special characters
    text = re.sub(r'♪|[\[\]]', '', text)
    # Keep Vietnamese characters and spaces
    text = re.sub(r'[^\w\sàáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ]', ' ', text.lower())
    # Normalize whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def extract_ngrams(text: str, n: int) -> list:
    """Extract n-grams from text."""
    words = text.split()
    if len(words) < n:
        return []
    return [' '.join(words[i:i+n]) for i in range(len(words) - n + 1)]


def get_top_ngrams(text: str, n: int, top_k: int = 50, min_count: int = 2) -> list:
    """Get top k n-grams by frequency."""
    ngrams = extract_ngrams(text, n)
    counts = Counter(ngrams)

    # Filter by minimum count and get top k
    filtered = [(ngram, count) for ngram, count in counts.most_common()
                if count >= min_count][:top_k]

    return [{"text": ngram, "count": count} for ngram, count in filtered]


def process_transcript(transcript_path: Path, min_count: int = 2) -> dict:
    """Process a transcript and extract all n-grams."""
    text = transcript_path.read_text(encoding='utf-8')
    cleaned = clean_text(text)

    # Common Vietnamese stopwords to filter out for unigrams
    stopwords = {
        'và', 'là', 'của', 'có', 'được', 'để', 'trong', 'với', 'cho',
        'này', 'đó', 'thì', 'mà', 'như', 'nếu', 'khi', 'từ', 'ra',
        'vào', 'lên', 'xuống', 'ở', 'tại', 'cũng', 'vì', 'nên', 'hay',
        'hoặc', 'nhưng', 'còn', 'đã', 'sẽ', 'đang', 'rồi', 'lại',
        'thế', 'vậy', 'đây', 'kia', 'nào', 'gì', 'ai', 'sao',
    }

    result = {
        "unigrams": [],
        "bigrams": [],
        "trigrams": [],
        "fourgrams": [],
    }

    # Unigrams (filter stopwords and short words)
    unigrams = get_top_ngrams(cleaned, 1, top_k=100, min_count=min_count)
    result["unigrams"] = [
        u for u in unigrams
        if u["text"] not in stopwords and len(u["text"]) >= 2
    ][:50]

    # Bigrams
    result["bigrams"] = get_top_ngrams(cleaned, 2, top_k=50, min_count=min_count)

    # Trigrams
    result["trigrams"] = get_top_ngrams(cleaned, 3, top_k=30, min_count=min_count)

    # Fourgrams
    result["fourgrams"] = get_top_ngrams(cleaned, 4, top_k=20, min_count=min_count)

    return result


def main():
    parser = argparse.ArgumentParser(description="Extract n-grams from Vietnamese transcript")
    parser.add_argument("transcript", help="Path to transcript file")
    parser.add_argument("--output", "-o", help="Output JSON file")
    parser.add_argument("--min-count", type=int, default=2, help="Minimum count for n-grams")

    args = parser.parse_args()

    transcript_path = Path(args.transcript)
    if not transcript_path.exists():
        print(f"Error: {transcript_path} not found")
        return

    result = process_transcript(transcript_path, args.min_count)

    # Add stats
    result["stats"] = {
        "unigrams": len(result["unigrams"]),
        "bigrams": len(result["bigrams"]),
        "trigrams": len(result["trigrams"]),
        "fourgrams": len(result["fourgrams"]),
    }

    output_json = json.dumps(result, ensure_ascii=False, indent=2)

    if args.output:
        Path(args.output).write_text(output_json, encoding='utf-8')
        print(f"Saved to {args.output}")
    else:
        print(output_json)

    # Print summary
    print(f"\nExtracted:")
    print(f"  - {len(result['unigrams'])} unigrams (single words)")
    print(f"  - {len(result['bigrams'])} bigrams (2-word phrases)")
    print(f"  - {len(result['trigrams'])} trigrams (3-word phrases)")
    print(f"  - {len(result['fourgrams'])} fourgrams (4-word phrases)")


if __name__ == "__main__":
    main()
