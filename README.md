# BellCraft — بيل كرافت

Arabic RTL school schedule and bell management app.
Supports **Android** (Capacitor + Gradle) and **iOS** (Capacitor + Xcode).

## Quick start

```bash
npm install
VITE_API_BASE_URL=https://bell-schedule-manager.replit.app npm run build
```

## Android

```bash
npm run cap-sync-android
# Open android/ in Android Studio → Build → Build APK(s)
# OR use GitHub Actions (see .github/workflows/build-apk.yml)
```

Requirements: Node.js 22+ · Java JDK 21 (Temurin) · Android Studio

## iOS

```bash
npm run cap-sync-ios
cd ios/App && pod install
# Open ios/App/App.xcworkspace in Xcode → Product → Archive
```

Requirements: macOS · Xcode 15+ · CocoaPods (`sudo gem install cocoapods`)

## GitHub Actions

| Workflow | Platform | Runner |
|---|---|---|
| Build BellCraft APK | Android Debug | ubuntu-latest |
| Build BellCraft iOS | iOS Simulator | macos-latest |

Trigger both from **Actions → Run workflow**.

## First-time repo setup

See [SETUP.md](SETUP.md) for git initialisation steps.
