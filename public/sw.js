// Generate a unique cache version based on timestamp to force cache invalidation on each deployment
const CACHE_VERSION = 'v-' + new Date().getTime();
const CACHE_NAME = 'paradigm-' + CACHE_VERSION;

// Only cache truly static assets (fonts, images, etc.)
// DO NOT cache index.html or JS/CSS bundles as they change with each deployment
const STATIC_ASSETS = [
  '/Paradigm-Logo-3-1024x157.png',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/manifest.json'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  // Force the waiting service worker to become the active service worker
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

// Activate event - delete old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Delete all caches that don't match the current CACHE_NAME
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Take control of all clients immediately
      return self.clients.claim();
    })
  );
});

// Fetch event - Network-first strategy for HTML/JS/CSS, Cache-fallback for images
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Network-first for HTML, JS, CSS (always get fresh version)
  if (
    request.method === 'GET' && 
    (url.pathname.endsWith('.html') || 
     url.pathname.endsWith('.js') || 
     url.pathname.endsWith('.css') ||
     url.pathname === '/')
  ) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Clone the response and cache it for offline use
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // If network fails, try cache as fallback
          return caches.match(request);
        })
    );
    return;
  }

  // Cache-first for static assets (images, icons, etc.)
  if (
    request.method === 'GET' && 
    (url.pathname.endsWith('.png') || 
     url.pathname.endsWith('.jpg') || 
     url.pathname.endsWith('.svg') ||
     url.pathname.endsWith('.ico') ||
     url.pathname.includes('/icons/'))
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request).then((response) => {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
          return response;
        });
      })
    );
    return;
  }

  // For all other requests, just fetch from network
  event.respondWith(fetch(request));
});
