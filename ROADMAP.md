# Vietnamese Tone Trainer - Roadmap

## Current Status (December 2025)

### Completed
- [x] Web app (React + Vite + TypeScript)
- [x] Mobile app (Expo/React Native)
- [x] FSRS spaced repetition system
- [x] FPT.AI Vietnamese TTS integration
- [x] Embedded audio for offline playback (318 words)
- [x] Android APK build via EAS Build
- [x] Cross-platform audio playback (web, Android, iOS)

### APK Download
- Preview build: https://expo.dev/artifacts/eas/auJDjRH3XgjTPQerUYJoMU.apk

---

## Phase 1: Polish & Testing

### App Store Preparation
- [ ] Create app icon (1024x1024 for iOS, adaptive icon for Android)
- [ ] Design splash screen
- [ ] Add app screenshots for store listings
- [ ] Write app store descriptions (English, Vietnamese)
- [ ] Build production AAB for Google Play (`eas build --platform android --profile production`)
- [ ] Set up Google Play Console developer account
- [ ] Configure app signing and upload AAB

### iOS Build
- [ ] Configure iOS bundle identifier in app.json
- [ ] Set up Apple Developer account
- [ ] Build iOS app (`eas build --platform ios`)
- [ ] Submit to TestFlight for beta testing
- [ ] Submit to App Store

### Testing
- [ ] Test on multiple Android devices/versions
- [ ] Test on iOS devices
- [ ] Test offline mode thoroughly
- [ ] Test audio playback in various scenarios (background, interruptions)

---

## Phase 2: Feature Enhancements

### Learning Features
- [ ] Add tone visualization (pitch contour diagrams)
- [ ] Add minimal pair practice (similar-sounding words)
- [ ] Add sentence-level listening exercises
- [ ] Add recording/pronunciation comparison feature
- [ ] Add progress statistics and charts
- [ ] Add daily streak tracking

### Content Expansion
- [ ] Expand vocabulary (500+ words)
- [ ] Add word categories/topics
- [ ] Add example sentences for each word
- [ ] Add Northern vs Southern pronunciation variants

### UX Improvements
- [ ] Add onboarding tutorial
- [ ] Add settings screen (audio speed, daily goal)
- [ ] Add dark mode support
- [ ] Add haptic feedback on answer selection
- [ ] Improve animations and transitions

---

## Phase 3: Backend & Sync

### User Accounts
- [ ] Add user authentication (email, Google, Apple)
- [ ] Sync progress across devices
- [ ] Cloud backup of learning data

### Backend Infrastructure
- [ ] Deploy backend to cloud (Render, Railway, or AWS)
- [ ] Set up database (PostgreSQL) for user data
- [ ] Add API rate limiting and security
- [ ] Set up monitoring and error tracking

---

## Phase 4: Additional Languages

### Norwegian
- [ ] Source Norwegian TTS (e.g., Azure, Google Cloud)
- [ ] Create Norwegian vocabulary list
- [ ] Generate Norwegian audio files
- [ ] Add Norwegian tone/pitch accent training

### Spanish
- [ ] Add Spanish vocabulary
- [ ] Focus on accent/stress patterns
- [ ] Regional variants (Spain vs Latin America)

---

## Technical Debt

- [ ] Add comprehensive test suite (Jest, React Testing Library)
- [ ] Set up CI/CD pipeline (GitHub Actions)
- [ ] Add error boundary and crash reporting (Sentry)
- [ ] Optimize bundle size
- [ ] Add TypeScript strict mode
- [ ] Document API endpoints

---

## Commands Reference

```bash
# Development
cd mobile && npx expo start          # Start Expo dev server
cd frontend && npm run dev           # Start web dev server
cd backend && uvicorn app.main:app --reload --port 8001

# Build
eas build --platform android --profile preview     # APK for testing
eas build --platform android --profile production  # AAB for Play Store
eas build --platform ios                           # iOS build

# Audio generation
cd backend && python scripts/generate_audio.py
```
