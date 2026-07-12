/**
 * web-push-subscription.ts
 *
 * Manages browser Web Push subscription lifecycle:
 *  1. Register the service worker (/sw.js)
 *  2. Fetch the VAPID public key from the API
 *  3. Subscribe the browser and POST the subscription to the API
 *  4. Allow unsubscribing
 */

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function getVapidPublicKey(): Promise<string> {
  const res = await fetch(`${BASE}/api/push/vapid-public-key`);
  const data = await res.json();
  return data.publicKey as string;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const buf = new ArrayBuffer(rawData.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < rawData.length; i++) view[i] = rawData.charCodeAt(i);
  return view;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register(
      `${import.meta.env.BASE_URL}sw.js`,
      { scope: import.meta.env.BASE_URL },
    );
  } catch (err) {
    console.warn("[push] SW registration failed", err);
    return null;
  }
}

export async function subscribePush(): Promise<PushSubscription | null> {
  try {
    const reg = await registerServiceWorker();
    if (!reg) return null;

    const perm = await Notification.requestPermission();
    if (perm !== "granted") return null;

    const publicKey = await getVapidPublicKey();
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    const json = sub.toJSON();
    await fetch(`${BASE}/api/push/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: sub.endpoint,
        keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
      }),
    });

    return sub;
  } catch (err) {
    console.warn("[push] subscribe failed", err);
    return null;
  }
}

export async function unsubscribePush(): Promise<void> {
  try {
    if (!("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.getRegistration(
      import.meta.env.BASE_URL,
    );
    if (!reg) return;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;

    await fetch(`${BASE}/api/push/unsubscribe`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
    await sub.unsubscribe();
  } catch (err) {
    console.warn("[push] unsubscribe failed", err);
  }
}

export async function getPushSubscription(): Promise<PushSubscription | null> {
  try {
    if (!("serviceWorker" in navigator)) return null;
    const reg = await navigator.serviceWorker.getRegistration(
      import.meta.env.BASE_URL,
    );
    if (!reg) return null;
    return reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

export function isPushSupported(): boolean {
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}
