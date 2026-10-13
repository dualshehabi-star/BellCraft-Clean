import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setBaseUrl, setDeviceId } from "@/lib/api-client";
import { getOrCreateDeviceId } from "./lib/device-id";

// Initialize device ID before any fetch runs.
// Each device gets a permanent UUID stored in localStorage.
// Every API request carries it as X-Device-Id so each phone sees only its own data.
const deviceId = getOrCreateDeviceId();
setDeviceId(deviceId);

// In Capacitor bundled mode the WebView origin is https://localhost, so
// relative /api/... paths would go nowhere.  Set the base URL synchronously
// here — before createRoot — so the very first React Query fetch already
// targets the correct remote API server.
const _cap = (window as any).Capacitor;
if (_cap?.isNativePlatform?.()) {
  const apiBase = import.meta.env.VITE_API_BASE_URL;
  if (apiBase) setBaseUrl(apiBase);
}

createRoot(document.getElementById("root")!).render(<App />);
