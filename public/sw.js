self.addEventListener('push', function(event) {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { title: 'New announcement', body: 'You have a new announcement.' };
  }

  const title = payload.title || 'New announcement';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/assets/img/logo.jpg',
    badge: payload.icon || '/assets/img/logo.jpg',
    data: payload.data || { url: '/' }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url === url && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    }).catch(function(error) {
      console.error('Notification click error:', error);
    })
  );
});
