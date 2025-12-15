#!/usr/bin/env python3
"""
Find YouTube videos with spoken Vietnamese (auto-generated Vietnamese subtitles).

Auto-generated subtitles in Vietnamese = the audio IS Vietnamese
Manual subtitles in Vietnamese = could be translations from other languages

Usage:
    python scripts/find_vietnamese_videos.py VIDEO_ID [VIDEO_ID ...]

    # Test with known Vietnamese content channels:
    # - VOA Tiếng Việt
    # - VTV
    # - Vietnamese vloggers
"""

import sys
from youtube_transcript_api import YouTubeTranscriptApi


def check_video(video_id: str) -> dict:
    """Check if a video has spoken Vietnamese audio."""
    ytt = YouTubeTranscriptApi()

    try:
        transcript_list = ytt.list(video_id)

        result = {
            "video_id": video_id,
            "url": f"https://youtube.com/watch?v={video_id}",
            "has_vietnamese": False,
            "spoken_vietnamese": False,
            "transcript_type": None,
            "available_languages": [],
        }

        for t in transcript_list:
            result["available_languages"].append({
                "code": t.language_code,
                "name": t.language,
                "auto": t.is_generated
            })

            if t.language_code == "vi" or "viet" in t.language.lower():
                result["has_vietnamese"] = True
                if t.is_generated:
                    result["spoken_vietnamese"] = True
                    result["transcript_type"] = "auto-generated (SPOKEN VIETNAMESE)"
                else:
                    result["transcript_type"] = "manual (may be translation)"

        return result

    except Exception as e:
        return {
            "video_id": video_id,
            "error": str(e),
        }


def main():
    if len(sys.argv) < 2:
        print("Usage: python find_vietnamese_videos.py VIDEO_ID [VIDEO_ID ...]")
        print()
        print("Tip: To find Vietnamese content, search YouTube for:")
        print("  - 'VOA Tiếng Việt' (news)")
        print("  - 'VTV' (Vietnamese national TV)")
        print("  - 'Cee Jay Official' (vlog)")
        print("  - 'Woossi TV' (food)")
        print()
        print("Then copy video IDs from URLs and test them here.")
        sys.exit(1)

    video_ids = sys.argv[1:]

    print(f"Checking {len(video_ids)} video(s) for spoken Vietnamese...\n")

    spoken_vietnamese = []

    for vid in video_ids:
        result = check_video(vid)

        if "error" in result:
            print(f"❌ {vid}: Error - {result['error'][:50]}")
        elif result["spoken_vietnamese"]:
            print(f"✅ {vid}: SPOKEN VIETNAMESE (auto-generated subs)")
            spoken_vietnamese.append(result)
        elif result["has_vietnamese"]:
            print(f"⚠️  {vid}: Vietnamese subs (manual - may be translation)")
        else:
            langs = [l["code"] for l in result["available_languages"][:5]]
            print(f"❌ {vid}: No Vietnamese (has: {langs})")

    print()
    print(f"Found {len(spoken_vietnamese)} video(s) with spoken Vietnamese")

    if spoken_vietnamese:
        print("\nVideos with spoken Vietnamese audio:")
        for v in spoken_vietnamese:
            print(f"  {v['url']}")


if __name__ == "__main__":
    main()
