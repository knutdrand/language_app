// Backend API configuration
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001';

// TTS provider: 'fpt' (cloud, higher quality) or 'piper' (local)
export const TTS_PROVIDER = import.meta.env.VITE_TTS_PROVIDER || 'fpt';

// Audio URL helper
export function getAudioUrl(text: string, language: string = 'vi'): string {
  const slug = slugify(text);

  if (TTS_PROVIDER === 'fpt') {
    // FPT.AI audio files (MP3)
    return `${API_BASE_URL}/audio/vi_fpt/${slug}.mp3`;
  } else {
    // Piper audio files (WAV)
    return `${API_BASE_URL}/audio/${language}/${slug}.wav`;
  }
}

// Slugify text for audio filename lookup
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/đ/g, 'd')  // Vietnamese đ -> d (before NFD strips it)
    .normalize('NFD')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}
