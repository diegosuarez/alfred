import { api } from './api';

/** Convert a URL-safe base64 string (no padding) to a Uint8Array — the
 * shape PushManager.subscribe wants for applicationServerKey. */
function urlBase64ToUint8Array(b64url: string): Uint8Array {
  const padding = '='.repeat((4 - (b64url.length % 4)) % 4);
  const base64 = (b64url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const isPushSupported = (): boolean =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window;

/** Make sure the SW is registered, the browser has a push subscription
 * and the backend knows about it. Safe to call multiple times. */
export async function ensurePushSubscription(): Promise<void> {
  if (!isPushSupported()) return;
  if (Notification.permission !== 'granted') return;

  let registration: ServiceWorkerRegistration;
  try {
    registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });
  } catch (err) {
    console.error('Service worker registration failed:', err);
    return;
  }
  await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    try {
      const { public_key } = await api.getVapidPublicKey();
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(public_key),
      });
    } catch (err) {
      console.error('Push subscription failed:', err);
      return;
    }
  }

  const json = subscription.toJSON() as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    console.error('Push subscription missing fields:', json);
    return;
  }
  try {
    await api.subscribePush({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    });
  } catch (err) {
    console.error('Could not send push subscription to backend:', err);
  }
}
