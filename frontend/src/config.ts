// Backend API configuration
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8023';

// TTS provider: 'fpt' (cloud, higher quality) or 'piper' (local)
export const TTS_PROVIDER = import.meta.env.VITE_TTS_PROVIDER || 'fpt';

// Audio URL helper - now requires word ID for unique filenames
export function getAudioUrl(wordId: number, text: string, language: string = 'vi'): string {
  const filename = getAudioFilename(wordId, text);

  if (TTS_PROVIDER === 'fpt') {
    // FPT.AI audio files (MP3)
    return `${API_BASE_URL}/audio/vi_fpt/${filename}.mp3`;
  } else {
    // Piper audio files (WAV)
    return `${API_BASE_URL}/audio/${language}/${filename}.wav`;
  }
}

// Generate unique audio filename using word ID and slug
// Format: {id}_{slug} (e.g., "42_ban")
// The ID ensures uniqueness when different Vietnamese words have the same ASCII slug
// (e.g., bàn, bạn, bán all become 'ban')
function getAudioFilename(wordId: number, text: string): string {
  const slug = slugify(text);
  return `${wordId}_${slug}`;
}

// Slugify text for audio filename (for readability only, ID ensures uniqueness)
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/đ/g, 'd')  // Vietnamese đ -> d (before NFD strips it)
    .normalize('NFD')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}
