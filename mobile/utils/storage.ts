import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Cross-platform storage abstraction.
 * Uses AsyncStorage for React Native, which works on iOS, Android, and web.
 */
export const storage = {
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await AsyncStorage.getItem(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error(`Failed to get ${key} from storage:`, error);
      return null;
    }
  },

  async set<T>(key: string, value: T): Promise<void> {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error(`Failed to set ${key} in storage:`, error);
    }
  },

  async remove(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key);
    } catch (error) {
      console.error(`Failed to remove ${key} from storage:`, error);
    }
  },

  async getAllKeys(): Promise<string[]> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      return keys as string[];
    } catch (error) {
      console.error('Failed to get all storage keys:', error);
      return [];
    }
  },

  async clear(): Promise<void> {
    try {
      await AsyncStorage.clear();
    } catch (error) {
      console.error('Failed to clear storage:', error);
    }
  },
};

// Storage keys used throughout the app
export const STORAGE_KEYS = {
  WORD_CARDS: 'language_app_word_cards',
  TONE_CARDS: 'language_app_tone_cards',
  PROGRESS: 'language_app_progress',
  SETTINGS: 'language_app_settings',
} as const;
