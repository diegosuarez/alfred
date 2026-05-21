// Service Worker for Alfred — receives Web Push deliveries and bridges
// notification clicks back to the SPA window.

self.addEventListener('install', () => {
  // Activate immediately so updates take effect on next reload without
  // waiting for clients to close.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  console.log('[Alfred SW] push event received', event);
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    // DevTools' "test push message" button sends a non-JSON body; that's
    // fine, we fall through to defaults.
    try {
      const text = event.data ? event.data.text() : '';
      data = { body: text || 'Recordatorio' };
    } catch (__) {
      /* no-op */
    }
  }
  console.log('[Alfred SW] payload:', data);
  const title = data.title || 'Alfred';
  const options = {
    body: data.body || 'Recordatorio',
    icon: '/logo.png',
    badge: '/logo.png',
    tag: data.tag || `alfred-reminder-${data.reminder_id || ''}`,
    data: {
      task_id: data.task_id,
      reminder_id: data.reminder_id,
      remind_at: data.remind_at,
    },
    // Stays visible until the user interacts with it — helps debug if
    // the OS notification center is hiding short-lived alerts.
    requireInteraction: true,
  };
  event.waitUntil(
    self.registration.showNotification(title, options).then(
      () => console.log('[Alfred SW] showNotification resolved'),
      (err) => console.error('[Alfred SW] showNotification rejected:', err),
    ),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const taskId = event.notification.data && event.notification.data.task_id;
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const c of all) {
        if ('focus' in c) {
          await c.focus();
          if (taskId) {
            c.postMessage({ type: 'reminder-click', taskId });
          }
          return;
        }
      }
      if (self.clients.openWindow) {
        const url = taskId ? `/?focus_task=${taskId}` : '/';
        await self.clients.openWindow(url);
      }
    })(),
  );
});
