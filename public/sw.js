// PWA Cache Configuration
const CACHE_NAME = 'bsba-portal-v1';
const urlsToCache = [
  '/',
  '/dashboard',
  '/style.css',
  '/delete-confirmation.js',
  '/reset-confirmation.js',
  '/pwa-install.js',
  '/assets/img/logo.png',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'
];

// Install Event - Cache assets on first load
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        console.log('Service Worker: Caching app shell');
        return cache.addAll(urlsToCache);
      })
      .catch(function(error) {
        console.error('Service Worker: Cache failed during install:', error);
      })
  );
});

// Activate Event - Clean up old caches
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Fetch Event - Network-first for HTML, cache-first for assets
self.addEventListener('fetch', function(event) {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);
  
  // Network-first strategy for HTML pages (EJS views)
  if (event.request.destination === 'document' || url.pathname.endsWith('.ejs')) {
    event.respondWith(
      fetch(event.request)
        .then(function(response) {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          // Cache it for offline fallback, but network takes priority
          const responseToCache = response.clone();
          caches.open(CACHE_NAME)
            .then(function(cache) {
              cache.put(event.request, responseToCache);
            });
          return response;
        })
        .catch(function() {
          // Fall back to cache if network fails
          return caches.match(event.request)
            .then(function(response) {
              return response || new Response('Offline - Page not available');
            });
        })
    );
  } else {
    // Cache-first strategy for assets (CSS, JS, images, fonts)
    event.respondWith(
      caches.match(event.request)
        .then(function(response) {
          // Cache hit - return response
          if (response) {
            return response;
          }

          return fetch(event.request).then(function(response) {
            // Check if we received a valid response
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Clone the response
            const responseToCache = response.clone();

            // Cache the fetched response for future use
            caches.open(CACHE_NAME)
              .then(function(cache) {
                cache.put(event.request, responseToCache);
              });

            return response;
          });
        })
        .catch(function() {
          // Return a custom offline page or cached content
          return caches.match('/') || new Response('Offline - Application cache unavailable');
        })
    );
  }
});

// Push Notification Event
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
    icon: payload.icon || '/assets/img/logo.png',
    badge: payload.icon || '/assets/img/logo.png',
    data: payload.data || { url: '/' }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification Click Event
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
