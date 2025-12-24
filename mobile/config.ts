// Backend API configuration
// Use EXPO_PUBLIC_API_URL to override (e.g., for production server)
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8023';

// Audio URL helper - requires word ID for unique filenames
// Optional voice/speed params for parameterized audio
export function getAudioUrl(
  wordId: number,
  text: string,
  language?: string,  // Kept for backward compatibility, not used
  voice?: string,
  speed?: number
): string {
  const filename = getAudioFilename(wordId, text);
  const params = new URLSearchParams();
  if (voice) params.set('voice', voice);
  if (speed !== undefined && speed !== 0) params.set('speed', speed.toString());
  const queryString = params.toString();
  return `${API_BASE_URL}/audio/vi_fpt/${filename}.mp3${queryString ? `?${queryString}` : ''}`;
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
