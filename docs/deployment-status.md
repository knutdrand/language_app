# Deployment Status

Last updated: December 19, 2024

## Backend Deployment

**Server**: DigitalOcean Droplet at `68.183.12.6`

| Component | Details |
|-----------|---------|
| API URL | http://68.183.12.6:8080 |
| Internal Port | 8001 (uvicorn) |
| Web Server | nginx (proxy on port 8080) |
| Service | systemd `language-app.service` |
| Database | SQLite at `/var/www/language_app/backend/data/app.db` |
| Audio Files | `/var/www/language_app/backend/audio/` |

### Configuration Files
- Nginx: `/etc/nginx/sites-available/language-app` (see `deploy/language-app.nginx`)
- Systemd: `/etc/systemd/system/language-app.service` (see `deploy/language-app.service`)

### Server Management Commands
```bash
# SSH to server
ssh root@68.183.12.6

# Service management
sudo systemctl status language-app
sudo systemctl restart language-app
sudo journalctl -u language-app -f

# Deploy updates
cd /var/www/language_app
git pull
sudo systemctl restart language-app
```

---

## Android Deployment

### Build Artifacts

| Type | Status | URL |
|------|--------|-----|
| Preview APK | Ready | https://expo.dev/accounts/knutdrand/projects/vietnamese-tone-trainer/builds/b64e8c8e-386c-4d31-b6e9-d3c0a60094e6 |
| Production AAB | Ready | https://expo.dev/artifacts/eas/5DhRSRmHFR2omBN5utMKmM.aab |

### EAS Build Commands
```bash
cd mobile

# Preview build (APK for testing)
eas build --platform android --profile preview

# Production build (AAB for Play Store)
eas build --platform android --profile production

# Check build status
eas build:list
```

### Environment Configuration
Production API URL is configured in `mobile/eas.json`:
```json
{
  "env": {
    "EXPO_PUBLIC_API_URL": "http://68.183.12.6:8080"
  }
}
```

---

## Google Play Store

### Assets Ready

| Asset | Location | Status |
|-------|----------|--------|
| Privacy Policy | https://knutdrand.github.io/language_app/privacy-policy.html | Live |
| Store Listing | `docs/play-store-listing.md` | Ready |
| App Icon | Configured in app | Ready |

### To Complete Submission

1. **Google Play Developer Account**
   - Register at https://play.google.com/console
   - One-time fee: $25
   - Approval time: 1-2 days

2. **Create App in Play Console**
   - App name: Vietnamese Tone Trainer
   - Category: Education
   - Content rating: Everyone

3. **Upload Store Listing**
   - Copy content from `docs/play-store-listing.md`
   - Upload AAB from link above

4. **Capture Screenshots**
   - Main practice screen (audio button + 4 images)
   - Progress/stats screen
   - Word list screen
   - Login screen
   - Size: 1080x1920 px minimum

5. **Submit for Review**
   - First app review: 3-7 days
   - Subsequent updates: 1-3 days

---

## GitHub Pages

Privacy policy hosted via GitHub Pages from `/docs` folder.

**URL**: https://knutdrand.github.io/language_app/privacy-policy.html

---

## Quick Reference

```bash
# Test backend is running
curl http://68.183.12.6:8080/health

# Build new Android APK
cd mobile && eas build --platform android --profile preview

# Build new Android AAB for Play Store
cd mobile && eas build --platform android --profile production

# Deploy backend updates
ssh root@68.183.12.6 "cd /var/www/language_app && git pull && sudo systemctl restart language-app"
```
