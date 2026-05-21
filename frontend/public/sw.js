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
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    /* malformed payload — fall back to defaults */
  }
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
    requireInteraction: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
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
