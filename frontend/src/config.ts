// Backend API configuration
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001';

// Audio URL helper
export function getAudioUrl(text: string, language: string = 'vi'): string {
  const slug = slugify(text);
  return `${API_BASE_URL}/audio/${language}/${slug}.wav`;
}

// Slugify text for audio filename lookup
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}
