"""
Build generated-artifacts/BellCraft-Clean.zip (Android + iOS).
Run: python3 scripts/build_bellcraft_zip.py
"""
import zipfile, pathlib, json, textwrap, sys, argparse, hashlib

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', default='generated-artifacts/BellCraft-Clean.zip')
parser.add_argument('--npm-lockfile', type=pathlib.Path)
args = parser.parse_args()
SRC = pathlib.Path('artifacts/bellcraft')
OUT = pathlib.Path(args.output)
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.unlink(missing_ok=True)

# Directories to skip everywhere in the tree
EXCLUDE_DIRS = {
    'node_modules', 'dist', '.replit-artifact', '.git', '.gradle', 'build',
    # iOS-only build artifacts (not needed in source ZIP)
    'Pods', 'xcuserdata', 'DerivedData',
}
EXCLUDE_FILES = {'.tsbuildinfo'}

def should_include(rel: pathlib.Path) -> bool:
    for part in rel.parts[:-1]:
        if part in EXCLUDE_DIRS:
            return False
    if rel.parts[-1] in EXCLUDE_FILES:
        return False
    if rel.name.startswith('.env') or rel.suffix.lower() in {'.jks', '.keystore', '.log'}:
        return False
    if rel.name == 'local.properties':
        return False
    return True

# Fix package.json name for standalone repo
pkg = json.loads((SRC / 'package.json').read_text())
pkg['name'] = 'bellcraft'
clean_pkg = json.dumps(pkg, indent=2, ensure_ascii=False)

# ── GitHub Actions: Build Android APK ──────────────────────────────────────
build_apk_yml = textwrap.dedent("""\
name: Build BellCraft APK

on:
  push:
    branches: [main, master]
  workflow_dispatch:
    inputs:
      api_url:
        description: 'API server URL'
        required: true
        default: 'https://bell-schedule-manager.replit.app'

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Node.js 22
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Set up JDK 21
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '21'

      - name: Install dependencies
        run: npm install

      - name: Build web app
        env:
          VITE_API_BASE_URL: ${{ github.event.inputs.api_url || 'https://bell-schedule-manager.replit.app' }}
        run: npm run build

      - name: Sync Capacitor Android
        run: npm run cap-sync-android

      - name: Make gradlew executable
        run: chmod +x android/gradlew

      - name: Build Debug APK
        run: |
          cd android
          ./gradlew assembleDebug --no-daemon

      - name: Upload APK
        uses: actions/upload-artifact@v4
        with:
          name: BellCraft-Debug-APK
          path: android/app/build/outputs/apk/debug/app-debug.apk
          retention-days: 14
""")

# ── GitHub Actions: Build iOS (simulator — no signing required) ─────────────
build_ios_yml = textwrap.dedent("""\
name: Build BellCraft iOS

on:
  workflow_dispatch:
    inputs:
      api_url:
        description: 'API server URL'
        required: true
        default: 'https://bell-schedule-manager.replit.app'

jobs:
  build:
    runs-on: macos-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Node.js 22
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install dependencies
        run: npm install

      - name: Build web app
        env:
          VITE_API_BASE_URL: ${{ github.event.inputs.api_url || 'https://bell-schedule-manager.replit.app' }}
        run: npm run build

      - name: Sync Capacitor iOS
        run: npm run cap-sync-ios

      - name: Install CocoaPods dependencies
        run: |
          cd ios/App
          pod install

      - name: Build for simulator (no signing)
        run: |
          xcodebuild \
            -workspace ios/App/App.xcworkspace \
            -scheme App \
            -sdk iphonesimulator \
            -configuration Debug \
            -derivedDataPath ios/DerivedData \
            CODE_SIGNING_ALLOWED=NO \
            build

      - name: Upload build log on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: xcodebuild-log
          path: ios/DerivedData/Logs/Build/
          retention-days: 7
""")

# ── .gitignore ──────────────────────────────────────────────────────────────
gitignore = textwrap.dedent("""\
node_modules/
dist/

# Android build outputs
android/app/build/
android/.gradle/
android/capacitor-cordova-android-plugins/

# iOS build outputs
ios/App/Pods/
ios/App/build/
ios/App/output/
ios/DerivedData/
ios/App/xcuserdata/
ios/App/App.xcworkspace/
ios/App/App/public/
ios/App/App/capacitor.config.json
ios/App/App/config.xml
ios/capacitor-cordova-ios-plugins/

*.tsbuildinfo
.DS_Store
*.local
""")

# ── README.md ───────────────────────────────────────────────────────────────
readme_md = """\
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
"""

# ── SETUP.md ────────────────────────────────────────────────────────────────
setup_md = """# Update the existing BellCraft-Clean repository

1. Download and extract BellCraft-Clean.zip.
2. Copy everything INSIDE `bellcraft/` into the existing repository root.
   Include hidden `.github/`, `.gitignore` and `.npmrc` files. Preserve any
   repository-specific files not supplied by this archive.
3. Verify the root contains `package.json`, `package-lock.json`, `src/`,
   `public/`, `android/`, `capacitor.config.ts` and `.github/workflows/build-apk.yml`.
4. Commit/upload the files yourself. Nothing is pushed automatically by Replit.
5. Open GitHub Actions > Build BellCraft APK > Run workflow, or push to main/master.
6. After success, download the BellCraft-Debug-APK artifact and extract app-debug.apk.

Do not create a new app, rename the package, or replace the preserved workflow.
The workflow is byte-identical to the previous exported Build BellCraft APK
workflow. It does not use the separate workspace-root release-build workflow.

Read the signing warning in README.md BEFORE trying to update an installed APK.
Keep the old app installed until matching signing has been confirmed.

"""
setup_md += "### iOS note\n\n"
setup_md += "Before opening in Xcode for the first time, run:\n\n"
setup_md += "```bash\ncd ios/App && pod install\n```\n\n"
setup_md += "Then open `ios/App/App.xcworkspace` (not `App.xcodeproj`) in Xcode.\n"

# ── Build ZIP ───────────────────────────────────────────────────────────────
added = set()
with zipfile.ZipFile(OUT, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
    for fpath in sorted(SRC.rglob('*')):
        if fpath.is_dir():
            continue
        rel = fpath.relative_to(SRC)
        if not should_include(rel):
            continue
        arcname = f'bellcraft/{rel}'
        if arcname in added:
            continue
        added.add(arcname)
        if str(rel) == 'package.json':
            zf.writestr(arcname, clean_pkg)
        else:
            zf.write(fpath, arcname)

    zf.writestr('bellcraft/.github/workflows/build-apk.yml', build_apk_yml)
    zf.writestr('bellcraft/.github/workflows/build-ios.yml', build_ios_yml)
    zf.writestr('bellcraft/.gitignore',                       gitignore)
    zf.writestr('bellcraft/README.md',                        readme_md)
    zf.writestr('bellcraft/SETUP.md',                         setup_md)
    if args.npm_lockfile:
        lock = json.loads(args.npm_lockfile.read_text())
        if lock.get('name') != 'bellcraft':
            raise ValueError('The npm lockfile must belong to the standalone bellcraft package')
        # Do not export Replit's private registry URLs to GitHub. Without a
        # resolved URL npm uses the current machine's configured registry;
        # pinned versions and integrity hashes remain unchanged.
        for package in lock.get('packages', {}).values():
            if 'package-firewall.replit.internal' in package.get('resolved', ''):
                package.pop('resolved')
        if lock.get('packages', {}).get('', {}).get('dependencies', {}) != pkg.get('dependencies', {}):
            raise ValueError('npm lockfile runtime dependencies do not match the release')
        if lock.get('packages', {}).get('', {}).get('devDependencies', {}) != pkg.get('devDependencies', {}):
            raise ValueError('npm lockfile build dependencies do not match the release')
        zf.writestr('bellcraft/package-lock.json', json.dumps(lock, indent=2) + '\n')

# ── Verify ──────────────────────────────────────────────────────────────────
with zipfile.ZipFile(OUT) as zf:
    names = set(zf.namelist())
    sched = zf.read('bellcraft/src/pages/schedules.tsx').decode()
    wf    = zf.read('bellcraft/.github/workflows/build-apk.yml').decode()
    wf_ios = zf.read('bellcraft/.github/workflows/build-ios.yml').decode()
    pkg_j = json.loads(zf.read('bellcraft/package.json'))

    checks = {
        # ── rename fix ────────────────────────────────────────────────────
        "rename fix — dialog stays open":             "Do NOT call setEditOpen(false) here" in sched,
        "rename fix — onError inside dialog":         "setNameError" in sched,
        "rename fix — button disabled while pending": "disabled={updateSchedule.isPending}" in sched,
        "rename fix — no onInput handlers":           "onInput={(e)" not in sched,
        # ── core files ───────────────────────────────────────────────────
        "capacitor.config.ts":                        'bellcraft/capacitor.config.ts' in names,
        "src/pages/schedules.tsx":                    'bellcraft/src/pages/schedules.tsx' in names,
        "src/pages/dashboard.tsx":                    'bellcraft/src/pages/dashboard.tsx' in names,
        "src/pages/manual-setup.tsx":                 'bellcraft/src/pages/manual-setup.tsx' in names,
        "src/pages/auto-setup.tsx":                   'bellcraft/src/pages/auto-setup.tsx' in names,
        # ── package ──────────────────────────────────────────────────────
        "package.json (name=bellcraft)":              pkg_j.get('name') == 'bellcraft',
        "@capacitor/ios in devDeps":                  '@capacitor/ios' in pkg_j.get('devDependencies', {}),
        "cap-sync-android script":                    'cap-sync-android' in pkg_j.get('scripts', {}),
        "cap-sync-ios script":                        'cap-sync-ios' in pkg_j.get('scripts', {}),
        # ── Android ──────────────────────────────────────────────────────
        "android/app/build.gradle":                   'bellcraft/android/app/build.gradle' in names,
        "android/gradlew":                            'bellcraft/android/gradlew' in names,
        "android/app/capacitor.build.gradle":         'bellcraft/android/app/capacitor.build.gradle' in names,
        "scripts/fix-capacitor-settings.cjs":         'bellcraft/scripts/fix-capacitor-settings.cjs' in names,
        # ── iOS ──────────────────────────────────────────────────────────
        "ios/App/App.xcodeproj":                      any('ios/App/App.xcodeproj' in n for n in names),
        "ios/App/App/AppDelegate.swift":              'bellcraft/ios/App/App/AppDelegate.swift' in names,
        "ios/App/App/Info.plist":                     'bellcraft/ios/App/App/Info.plist' in names,
        "ios/App/CapApp-SPM/Package.swift":           'bellcraft/ios/App/CapApp-SPM/Package.swift' in names,
        "ios/App/App/public/index.html":              'bellcraft/ios/App/App/public/index.html' in names,
        "no ios/App/Pods":                            not any('/ios/App/Pods/' in n for n in names),
        "no ios/DerivedData":                         not any('/ios/DerivedData/' in n for n in names),
        # ── workflows ────────────────────────────────────────────────────
        ".github/workflows/build-apk.yml":            'bellcraft/.github/workflows/build-apk.yml' in names,
        ".github/workflows/build-ios.yml":            'bellcraft/.github/workflows/build-ios.yml' in names,
        "apk workflow: node 22":                      "node-version: '22'" in wf,
        "apk workflow: java 21 temurin":              "java-version: '21'" in wf and "temurin" in wf,
        "apk workflow: assembleDebug":                "assembleDebug" in wf,
        "ios workflow: macos-latest":                 "macos-latest" in wf_ios,
        "ios workflow: pod install":                  "pod install" in wf_ios,
        "ios workflow: xcodebuild":                   "xcodebuild" in wf_ios,
        # ── housekeeping ─────────────────────────────────────────────────
        ".gitignore":                                 'bellcraft/.gitignore' in names,
        "SETUP.md":                                   'bellcraft/SETUP.md' in names,
        "README.md":                                  'bellcraft/README.md' in names,
        ".npmrc":                                     'bellcraft/.npmrc' in names,
        "no .replit-artifact":                        not any('.replit-artifact' in n for n in names),
        "no node_modules":                            not any('node_modules' in n for n in names),
        "no dist/":                                   not any('/dist/' in n for n in names),
        "no .tsbuildinfo":                            not any('.tsbuildinfo' in n for n in names),
        "ZIP CRC integrity":                         zf.testzip() is None,
        "native alarm scheduler included":           'bellcraft/android/app/src/main/java/com/bellcraft/app/BellSchedulerPlugin.java' in names,
        "native bell service included":              'bellcraft/android/app/src/main/java/com/bellcraft/app/BellRingerService.java' in names,
        "native reboot receiver included":           'bellcraft/android/app/src/main/java/com/bellcraft/app/BellBootReceiver.java' in names,
        "Gradle wrapper JAR included":               'bellcraft/android/gradle/wrapper/gradle-wrapper.jar' in names,
        "package ID unchanged":                      'appId: "com.bellcraft.app"' in zf.read('bellcraft/capacitor.config.ts').decode(),
        "Android application ID unchanged":          'applicationId "com.bellcraft.app"' in zf.read('bellcraft/android/app/build.gradle').decode(),
        "no keystores or env files":                  not any(pathlib.Path(n).name.startswith('.env') or pathlib.Path(n).suffix.lower() in {'.jks', '.keystore'} for n in names),
    }
    # Every included source must be byte-identical to the latest saved file.
    # package.json is the existing standalone export adaptation, not the app ID.
    for fpath in SRC.rglob('*'):
        if fpath.is_file() and should_include(fpath.relative_to(SRC)):
            rel = fpath.relative_to(SRC)
            if str(rel) == 'package.json':
                continue
            arcname = f'bellcraft/{rel}'
            checks[f"latest source: {rel}"] = arcname in names and zf.read(arcname) == fpath.read_bytes()

    all_ok = True
    for k, v in checks.items():
        if not v:
            all_ok = False
        print(f"  {'OK' if v else 'FAIL'}  {k}")

    print()
    print(f"ZIP size : {OUT.stat().st_size // 1024} KB")
    print(f"Files    : {len(names)}")
    print(f"SHA-256  : {hashlib.sha256(OUT.read_bytes()).hexdigest()}")
    print()
    print("RESULT:", "ALL CHECKS PASSED" if all_ok else "FAILED")
    if not all_ok:
        sys.exit(1)
