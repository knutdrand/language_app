import { Platform } from 'react-native';

// Backend API configuration
// For Android emulator, use 10.0.2.2 instead of localhost
// For iOS simulator and web, use localhost
const getDefaultApiUrl = () => {
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:8001';
  }
  return 'http://localhost:8001';
};

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || getDefaultApiUrl();

// TTS provider: 'fpt' (cloud, higher quality) or 'piper' (local)
export const TTS_PROVIDER = process.env.EXPO_PUBLIC_TTS_PROVIDER || 'fpt';

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
