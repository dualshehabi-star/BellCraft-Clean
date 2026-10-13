import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor configuration for BellCraft — Android + iOS.
 *
 * The app is always bundled (the dist/ folder is copied to the native project).
 * All /api/* calls are routed to the deployed API server via VITE_API_BASE_URL
 * baked into the Vite bundle at build time.
 *
 * Android build steps
 * ───────────────────
 * 1. VITE_API_BASE_URL=https://bell-schedule-manager.replit.app npm run build
 * 2. npm run cap-sync-android
 * 3. Open android/ in Android Studio → Build → Build APK(s)
 *
 * iOS build steps (requires macOS + Xcode + CocoaPods)
 * ─────────────────────────────────────────────────────
 * 1. VITE_API_BASE_URL=https://bell-schedule-manager.replit.app npm run build
 * 2. npm run cap-sync-ios
 * 3. cd ios/App && pod install
 * 4. Open ios/App/App.xcworkspace in Xcode → Product → Archive
 */
const config: CapacitorConfig = {
  appId: "com.bellcraft.app",
  appName: "بيل كرافت",
  webDir: "dist/public",
  server: {
    androidScheme: "https",
    cleartext: false,
    allowNavigation: [],
  },
  android: {
    allowMixedContent: false,
    captureInput: false,
    // true = allows Chrome DevTools inspection via USB (chrome://inspect/#devices).
    // Disable this for release / store builds.
    webContentsDebuggingEnabled: true,
    // Match the app's light background so no blue flash appears during WebView init.
    backgroundColor: "#f8fafc",
  },
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_stat_icon_config_sample",
      iconColor: "#1e3a8a",
      sound: "classic_bell",
    },
  },
};

export default config;
