# Mobile App Development Plan: Vietnamese Tone Trainer

## Executive Summary

This plan outlines the strategy for converting the existing React web application into native iOS and Android mobile apps. The current app has a well-architected frontend (React + TypeScript + Tailwind) with a Python/FastAPI backend, making it suitable for several mobile development approaches.

---

## Part 1: Technology Decision

### Option A: React Native (Recommended)

**Approach**: Rewrite frontend using React Native, sharing ~70% of logic code.

**Pros**:
- Leverages existing React/TypeScript expertise
- Single codebase for iOS and Android
- Most hooks (`useFSRS.ts`, `useToneFSRS.ts`, `useProgress.ts`) can be reused with minimal changes
- Native performance for audio playback
- Large ecosystem (Expo simplifies deployment)
- Hot reloading for fast development

**Cons**:
- UI components must be rewritten (no direct Tailwind, but NativeWind exists)
- Some native modules may require bridging
- Slightly larger app size than pure native

**Estimated Code Reuse**:
| Layer | Reusable | Notes |
|-------|----------|-------|
| Types (`types.ts`) | 100% | Direct copy |
| Data (`words.json`, `toneFrequencies.ts`) | 100% | Direct copy |
| Utils (`tones.ts`) | 100% | Direct copy |
| Hooks (FSRS, Progress) | 90% | Replace `localStorage` with `AsyncStorage` |
| Components | 20% | Logic reusable, JSX needs rewrite |
| Styling | 0% | Tailwind → StyleSheet or NativeWind |

---

### Option B: Progressive Web App (PWA)

**Approach**: Add PWA capabilities to existing web app.

**Pros**:
- Minimal code changes
- Works on any device with a browser
- Instant updates (no app store approval)
- Can be "installed" to home screen

**Cons**:
- iOS Safari limitations (no background audio, limited notifications)
- No app store presence (discoverability)
- Limited offline audio caching
- Less "native" feel
- Web Speech API quality varies by device

**Best For**: Quick MVP or supplementary web experience alongside native apps.

---

### Option C: Capacitor (Hybrid)

**Approach**: Wrap existing React app in native container using Capacitor.

**Pros**:
- Minimal code changes to existing React app
- Access to native APIs via plugins
- Single codebase
- Can submit to app stores

**Cons**:
- WebView performance limitations
- Audio playback may have latency issues
- "Webby" feel on interactions
- Debugging can be complex

---

### Option D: Native Development (Swift + Kotlin)

**Approach**: Separate native apps for iOS (Swift/SwiftUI) and Android (Kotlin/Compose).

**Pros**:
- Best performance and native feel
- Full platform API access
- Smallest app size
- Best audio handling

**Cons**:
- Two separate codebases to maintain
- Requires iOS and Android expertise
- Longest development time
- Feature parity challenges

---

### Recommendation: React Native with Expo

**Why**: Best balance of code reuse, development speed, and native capabilities. Expo's managed workflow simplifies audio handling, app store deployment, and OTA updates.

---

## Part 2: Architecture for React Native

### 2.1 Project Structure

```
language_app_mobile/
├── app/                          # Expo Router screens
│   ├── (tabs)/
│   │   ├── index.tsx            # Home/Dashboard
│   │   ├── tone-drill.tsx       # Tone trainer
│   │   ├── image-drill.tsx      # Image recognition drill
│   │   └── settings.tsx         # Settings screen
│   ├── _layout.tsx              # Root layout
│   └── +not-found.tsx
├── components/
│   ├── AudioButton.tsx          # Native audio playback
│   ├── ToneGrid.tsx             # Tone sequence selector
│   ├── ImageGrid.tsx            # Image grid selector
│   ├── ProgressBar.tsx          # Session progress
│   └── StatsCard.tsx            # Statistics display
├── hooks/
│   ├── useFSRS.ts               # Word-based scheduling (port)
│   ├── useToneFSRS.ts           # Tone-based scheduling (port)
│   ├── useProgress.ts           # Progress tracking (port)
│   ├── useAudio.ts              # Native audio hook
│   └── useHaptics.ts            # Haptic feedback
├── stores/
│   ├── progressStore.ts         # Zustand with AsyncStorage
│   └── settingsStore.ts         # User preferences
├── utils/
│   ├── tones.ts                 # Tone utilities (direct port)
│   ├── api.ts                   # Backend API client
│   └── storage.ts               # AsyncStorage wrapper
├── data/
│   ├── words.json               # Vocabulary data
│   └── toneFrequencies.ts       # Frequency data
├── assets/
│   ├── audio/                   # Bundled audio files (optional)
│   └── images/                  # App icons, splash
├── app.json                     # Expo configuration
├── package.json
└── tsconfig.json
```

### 2.2 Key Dependencies

```json
{
  "dependencies": {
    "expo": "~52.0.0",
    "expo-av": "~14.0.0",           // Audio/video playback
    "expo-haptics": "~13.0.0",      // Haptic feedback
    "expo-file-system": "~17.0.0",  // Audio file caching
    "expo-router": "~4.0.0",        // File-based routing
    "expo-splash-screen": "~0.27.0",
    "zustand": "^5.0.0",            // State management
    "ts-fsrs": "^5.2.0",            // Spaced repetition
    "@react-native-async-storage/async-storage": "^2.0.0",
    "react-native-reanimated": "~3.16.0",  // Animations
    "nativewind": "^4.0.0"          // Tailwind for RN (optional)
  }
}
```

### 2.3 Component Migration Strategy

#### AudioButton → Native Audio

```typescript
// hooks/useAudio.ts
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';

export function useAudio() {
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const playWord = async (wordId: number, slug: string) => {
    // Check cache first
    const cacheUri = `${FileSystem.cacheDirectory}audio/${wordId}_${slug}.wav`;
    const cached = await FileSystem.getInfoAsync(cacheUri);

    let uri: string;
    if (cached.exists) {
      uri = cacheUri;
    } else {
      // Download and cache
      const remoteUrl = `${API_BASE_URL}/audio/vi/${wordId}_${slug}.wav`;
      await FileSystem.downloadAsync(remoteUrl, cacheUri);
      uri = cacheUri;
    }

    // Play audio
    const { sound } = await Audio.Sound.createAsync({ uri });
    setSound(sound);
    await sound.playAsync();
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => { sound?.unloadAsync(); };
  }, [sound]);

  return { playWord, isPlaying };
}
```

#### Storage Migration

```typescript
// utils/storage.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

// Replace localStorage calls with AsyncStorage
export const storage = {
  async get<T>(key: string): Promise<T | null> {
    const value = await AsyncStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  },

  async set<T>(key: string, value: T): Promise<void> {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  },

  async remove(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
  }
};
```

#### Zustand Store with Persistence

```typescript
// stores/progressStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const useProgressStore = create(
  persist(
    (set) => ({
      reviewsToday: 0,
      correctToday: 0,
      // ... same as web version
      recordReview: (correct: boolean) => {
        set((state) => ({
          reviewsToday: state.reviewsToday + 1,
          correctToday: state.correctToday + (correct ? 1 : 0),
        }));
        // Sync to backend (fire-and-forget)
        api.recordProgress(correct);
      },
    }),
    {
      name: 'progress-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
```

---

## Part 3: Feature Parity Checklist

### Core Features (Must Have)

| Feature | Web | Mobile | Notes |
|---------|-----|--------|-------|
| Tone Drill | ✓ | Required | Core feature |
| Image Drill | ✓ | Required | Core feature |
| Audio Playback | ✓ | Required | Use expo-av |
| FSRS Scheduling | ✓ | Required | Direct port with AsyncStorage |
| Progressive Unlocking | ✓ | Required | Tone syllable tiers |
| Progress Stats | ✓ | Required | Daily/total tracking |
| Source Filtering | ✓ | Required | Filter by corpus |
| Backend Sync | ✓ | Required | Same API |

### Mobile Enhancements (Should Have)

| Feature | Web | Mobile | Notes |
|---------|-----|--------|-------|
| Haptic Feedback | ✗ | Add | Correct/incorrect vibration |
| Audio Caching | ✗ | Add | Download on first play |
| Offline Mode | ✗ | Add | Queue syncs when online |
| Push Notifications | ✗ | Add | Daily practice reminders |
| Dark Mode | ✗ | Add | System preference support |
| Onboarding Flow | ✗ | Add | First-time user experience |

### Nice to Have (Future)

| Feature | Notes |
|---------|-------|
| Voice Recording | Record and compare pronunciation |
| Achievements/Streaks | Gamification |
| Social Features | Leaderboards, sharing |
| Multiple Languages | Norwegian, Spanish |
| Widget | iOS/Android home screen widget |

---

## Part 4: Backend Considerations

### 4.1 Current Backend (Keep As-Is Initially)

The FastAPI backend is well-suited for mobile:
- RESTful JSON API (mobile-friendly)
- CORS already configured
- Stateless endpoints
- Audio file serving works

### 4.2 Backend Enhancements for Mobile

**Authentication** (Future):
```python
# app/routers/auth.py
@router.post("/register")
async def register(device_id: str):
    # Anonymous registration with device ID
    # Enables cross-device sync later

@router.post("/login")
async def login(credentials: LoginRequest):
    # Optional email/social login
```

**Push Notifications** (Future):
```python
# app/routers/notifications.py
@router.post("/register-token")
async def register_push_token(token: PushToken):
    # Store FCM/APNs token for reminders
```

**Offline Sync** (Future):
```python
# app/routers/sync.py
@router.post("/sync")
async def sync_offline_changes(changes: List[Change]):
    # Batch sync of offline reviews
    # Handle conflicts with last-write-wins
```

### 4.3 Audio Delivery Optimization

**Current**: On-demand streaming from backend
**Recommended**: CDN + bundled common audio

```typescript
// Option 1: Bundle most common words
// Include top 50 audio files in app binary (~5MB)
import commonAudio from '../assets/audio/common.json';

// Option 2: CDN for remaining
const AUDIO_CDN = 'https://cdn.example.com/audio/vi/';

// Option 3: Progressive download
// Download next 10 due words' audio in background
```

---

## Part 5: Development Phases

### Phase 1: Foundation (Weeks 1-2)

**Goals**: Set up project, port core logic, basic navigation

**Tasks**:
1. Initialize Expo project with TypeScript
2. Set up Expo Router navigation
3. Port utility files (`tones.ts`, `types.ts`)
4. Port data files (`words.json`, `toneFrequencies.ts`)
5. Create API client for backend communication
6. Set up AsyncStorage wrapper
7. Basic app shell with tab navigation

**Deliverable**: App skeleton that compiles and runs on simulators

---

### Phase 2: Core Drills (Weeks 3-4)

**Goals**: Implement both drill modes with full functionality

**Tasks**:
1. Port `useToneFSRS.ts` hook (replace localStorage → AsyncStorage)
2. Port `useFSRS.ts` hook
3. Port `useProgress.ts` store to Zustand with persistence
4. Implement `ToneGrid` component with native styling
5. Implement `ImageGrid` component with Image caching
6. Implement `ToneDrill` screen
7. Implement `ImageDrill` screen
8. Basic audio playback (expo-av)

**Deliverable**: Functional drills matching web functionality

---

### Phase 3: Audio & Polish (Weeks 5-6)

**Goals**: Native audio experience, UX polish

**Tasks**:
1. Audio caching system (download on first play)
2. Background audio preloading (next 5 words)
3. Haptic feedback on correct/incorrect
4. Loading states and error handling
5. Animations (card flip, button press)
6. Progress/stats dashboard screen
7. Settings screen (audio quality, notifications)

**Deliverable**: Polished UX matching native app quality

---

### Phase 4: Mobile-Specific Features (Weeks 7-8)

**Goals**: Features unique to mobile

**Tasks**:
1. Push notification setup (Expo Notifications)
2. Daily reminder scheduling
3. Offline mode with sync queue
4. Dark mode support
5. Onboarding flow for new users
6. App icon and splash screen
7. Source selector filter

**Deliverable**: Feature-complete mobile app

---

### Phase 5: Testing & Deployment (Weeks 9-10)

**Goals**: Quality assurance, app store submission

**Tasks**:
1. Unit tests for hooks and utilities
2. Integration tests for drill flows
3. Manual testing on physical devices
4. Performance profiling (audio latency, memory)
5. App Store assets (screenshots, description)
6. TestFlight beta testing
7. Google Play internal testing
8. App store submission

**Deliverable**: Apps live on App Store and Google Play

---

## Part 6: Technical Deep Dives

### 6.1 Audio Latency Optimization

Audio latency is critical for a tone trainer. Strategies:

```typescript
// Preload upcoming audio
const preloadQueue = async (nextWords: Word[]) => {
  for (const word of nextWords.slice(0, 5)) {
    const uri = getAudioUri(word);
    await Audio.Sound.createAsync(
      { uri },
      { shouldPlay: false },
      null,
      true // downloadFirst
    );
  }
};

// Use lower latency audio mode
await Audio.setAudioModeAsync({
  playsInSilentModeIOS: true,
  staysActiveInBackground: false,
  shouldDuckAndroid: true,
});
```

### 6.2 Offline-First Architecture

```typescript
// stores/syncStore.ts
interface PendingReview {
  id: string;
  timestamp: number;
  type: 'tone' | 'word';
  key: string;  // sequence_key or word_id
  rating: number;
  correct: boolean;
}

const useSyncStore = create(
  persist(
    (set, get) => ({
      pendingReviews: [] as PendingReview[],

      addPendingReview: (review: PendingReview) => {
        set({ pendingReviews: [...get().pendingReviews, review] });
      },

      syncToBackend: async () => {
        const pending = get().pendingReviews;
        if (pending.length === 0) return;

        try {
          await api.batchSync(pending);
          set({ pendingReviews: [] });
        } catch (e) {
          // Will retry on next app open or connectivity change
        }
      }
    }),
    { name: 'sync-storage', storage: createJSONStorage(() => AsyncStorage) }
  )
);

// Sync on app foreground
useEffect(() => {
  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      useSyncStore.getState().syncToBackend();
    }
  });
  return () => subscription.remove();
}, []);
```

### 6.3 Image Caching Strategy

```typescript
// Use expo-image for efficient caching
import { Image } from 'expo-image';

// In ImageGrid.tsx
<Image
  source={{ uri: word.imageUrl }}
  style={styles.image}
  contentFit="cover"
  transition={200}
  cachePolicy="memory-disk"  // Cache aggressively
  placeholder={blurhash}      // Show placeholder while loading
/>
```

---

## Part 7: Monetization Considerations (Optional)

### Free Tier
- Full access to tone trainer
- 50 words vocabulary
- Basic progress tracking

### Premium Tier ($4.99/month or $29.99/year)
- Unlimited vocabulary
- Advanced analytics
- Cloud sync across devices
- Offline audio pack download
- Priority support

### Implementation
- Use RevenueCat for subscription management
- Gate premium features with simple flag check
- Generous free tier to build user base

---

## Part 8: Analytics & Monitoring

### Recommended Tools

1. **Expo Analytics** (built-in): Basic usage metrics
2. **Sentry**: Crash reporting and error tracking
3. **Mixpanel/Amplitude**: User behavior analytics

### Key Metrics to Track

```typescript
// events.ts
export const trackEvent = (name: string, props?: object) => {
  // Track to analytics provider
};

// Usage
trackEvent('drill_completed', {
  mode: 'tone',
  correct: true,
  sequence_key: '3-2',
  response_time_ms: 1200,
  syllable_count: 2,
});

trackEvent('audio_played', {
  word_id: 42,
  source: 'cache' | 'network',
  latency_ms: 50,
});

trackEvent('session_started', {
  reviews_due: 15,
  last_session_hours_ago: 18,
});
```

---

## Part 9: Risk Assessment

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Audio latency issues | Medium | High | Preloading, native audio module |
| Expo limitations | Low | Medium | Can eject to bare workflow |
| App store rejection | Low | High | Follow guidelines, test thoroughly |
| Backend scaling | Low | Medium | Current backend handles single user well |

### Schedule Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Scope creep | High | Medium | Strict MVP definition |
| Platform-specific bugs | Medium | Medium | Test on real devices early |
| App store review delays | Medium | Low | Submit early, iterate |

---

## Part 10: Success Criteria

### MVP Launch Criteria

- [ ] Tone drill functional with all current features
- [ ] Image drill functional with all current features
- [ ] Audio plays reliably on iOS and Android
- [ ] FSRS scheduling works correctly
- [ ] Progress syncs to backend
- [ ] No crashes in 1 hour of continuous use
- [ ] App size < 50MB
- [ ] Cold start < 3 seconds

### 30-Day Post-Launch Criteria

- [ ] 100+ downloads
- [ ] 4.0+ star rating
- [ ] < 1% crash rate
- [ ] 50%+ day-7 retention
- [ ] Average 5+ minutes per session

---

## Appendix A: Expo Setup Commands

```bash
# Create new Expo project
npx create-expo-app@latest language_app_mobile --template tabs

# Navigate to project
cd language_app_mobile

# Install core dependencies
npx expo install expo-av expo-haptics expo-file-system @react-native-async-storage/async-storage

# Install additional dependencies
npm install zustand ts-fsrs

# Run on iOS simulator
npx expo run:ios

# Run on Android emulator
npx expo run:android

# Build for app stores
eas build --platform all
```

---

## Appendix B: File Migration Checklist

### Direct Copy (No Changes)
- [ ] `types.ts`
- [ ] `data/words.json`
- [ ] `data/sources.json`
- [ ] `utils/tones.ts`
- [ ] `data/toneFrequencies.ts`

### Minor Modifications (localStorage → AsyncStorage)
- [ ] `hooks/useFSRS.ts`
- [ ] `hooks/useToneFSRS.ts`
- [ ] `hooks/useProgress.ts`
- [ ] `hooks/useAttemptLog.ts`

### Rewrite Required
- [ ] `components/AudioButton.tsx` → Native audio
- [ ] `components/ToneGrid.tsx` → React Native components
- [ ] `components/ImageGrid.tsx` → React Native Image
- [ ] `components/Drill.tsx` → Screen component
- [ ] `components/ToneDrill.tsx` → Screen component
- [ ] `App.tsx` → Expo Router layout

### New Files Needed
- [ ] `hooks/useAudio.ts` - Native audio playback
- [ ] `hooks/useHaptics.ts` - Haptic feedback
- [ ] `utils/storage.ts` - AsyncStorage wrapper
- [ ] `utils/api.ts` - Backend API client
- [ ] `app/(tabs)/_layout.tsx` - Tab navigation
- [ ] `app/(tabs)/settings.tsx` - Settings screen
- [ ] `stores/settingsStore.ts` - User preferences

---

## Conclusion

This plan provides a clear path from the current web application to native iOS and Android apps using React Native with Expo. The approach maximizes code reuse (~70% of logic), maintains feature parity, and adds mobile-specific enhancements.

The phased approach allows for iterative development and early testing, with a realistic path to app store deployment. The existing backend requires minimal changes initially, with clear upgrade paths for authentication, push notifications, and offline sync.

**Next Steps**:
1. Validate technology choice (React Native vs alternatives)
2. Set up development environment
3. Begin Phase 1 implementation
