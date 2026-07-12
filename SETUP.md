# First-Time Repository Setup

Run these commands from inside the extracted `bellcraft/` folder:

```bash
  git init
  git add -A
  git commit -m "BellCraft initial commit"
  git remote add origin https://github.com/YOUR_USERNAME/bellcraft.git
  git branch -M main
  git push -u origin main
```

Then go to GitHub Actions and trigger **Build BellCraft APK** (Android) or **Build BellCraft iOS** (iOS).

### iOS note

Before opening in Xcode for the first time, run:

```bash
cd ios/App && pod install
```

Then open `ios/App/App.xcworkspace` (not `App.xcodeproj`) in Xcode.
