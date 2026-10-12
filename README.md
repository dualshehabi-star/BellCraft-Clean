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

## Updating the existing BellCraft-Clean repository

See [SETUP.md](SETUP.md). Extract the archive, then copy the CONTENTS of
`bellcraft/` to the repository root, including `.github/`. Do not add an
extra `bellcraft/` level in the repository and do not initialise a new project.

The existing **Build BellCraft APK** workflow is preserved. The Android app
label remains **BellCraft**, and its application ID remains `com.bellcraft.app`.
Capacitor was updated within major version 8 to 8.5.3 because 8.4.0 was blocked
by the package security policy. The npm lockfile pins the clean-install
dependencies without private Replit registry URLs.

## Important: updating an installed APK

The preserved workflow runs `assembleDebug`. A new GitHub runner may generate
a different debug signing key. Android accepts an in-place update only when
the signing certificate matches the installed APK; the same app name and
package ID alone are not enough. Reuse the original signing key for an update.
Do not uninstall the existing app to work around a signature mismatch, since
that can erase its locally saved data.

## Verification scope

The exported source, native alarm classes, sounds, widget resources and Gradle
wrapper were checked. A clean npm install, TypeScript check, production Vite
build and Android Capacitor sync passed. This does NOT certify the final APK:
Gradle compilation must still run in GitHub Actions or Android Studio, and
background/reboot alarm behavior must be tested on an Android device.

Dependencies are installed by `npm install`; `node_modules`, local signing
keys, secrets and build caches are deliberately not included. Existing app
data was not deleted or changed by packaging.
