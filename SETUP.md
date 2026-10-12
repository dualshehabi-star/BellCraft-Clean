# Update the existing BellCraft-Clean repository

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

### iOS note

Before opening in Xcode for the first time, run:

```bash
cd ios/App && pod install
```

Then open `ios/App/App.xcworkspace` (not `App.xcodeproj`) in Xcode.
