const CACHE_NAME = 'playfunia-v5';
const STATIC_CACHE = 'playfunia-static-v5';
const IMAGE_CACHE = 'playfunia-images-v5';

// Track if user has consented to enhanced caching
let imageCacheEnabled = true; // Default to true for performance

// Assets to cache immediately on install (critical path)
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/images/logo.png',
  // Optimized hero images - critical for LCP
  '/images/optimized/hero/hero-ballpit-logo-800w.avif',
  '/images/optimized/hero/hero-ballpit-logo-1200w.avif',
  '/images/optimized/hero/hero-ballpit-logo-1600w.avif',
  '/images/optimized/hero/hero-ballpit-logo-800w.webp',
  '/images/optimized/hero/hero-ballpit-logo-1200w.webp',
  '/images/optimized/hero/hero-ballpit-logo-1600w.webp',
];

// Additional images to cache for faster subsequent loads
const PRECACHE_IMAGES = [
  '/images/facility/entrance.jpg',
  '/images/facility/play-area.jpg',
  '/images/facility/party-room.jpg',
  '/images/facility/toddler-zone.jpg',
  '/images/facility/slide-area.jpg',
  '/images/facility/trampoline.jpg',
  '/images/parties/birthday-parties.jpg',
  '/images/zones/ball-pit.jpg',
  '/images/zones/trampolines.jpg',
  '/images/zones/slides.jpg',
  '/images/zones/toddler-area.jpg',
];

// Install event - precache critical assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      // Cache critical static assets
      caches.open(STATIC_CACHE).then((cache) => {
        return cache.addAll(PRECACHE_ASSETS);
      }),
      // Cache images separately for better cache management
      caches.open(IMAGE_CACHE).then((cache) => {
        // Use addAll with catch to prevent install failure if some images don't exist yet
        return cache.addAll(PRECACHE_IMAGES).catch(() => {
          console.log('[SW] Some precache images not available yet');
        });
      }),
    ])
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== STATIC_CACHE && name !== IMAGE_CACHE)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Handle messages from the main app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'ENABLE_IMAGE_CACHE') {
    imageCacheEnabled = true;
    console.log('[SW] Image caching enabled by user consent');

    // Proactively cache common images when user accepts
    caches.open(IMAGE_CACHE).then((cache) => {
      cache.addAll(PRECACHE_IMAGES).catch(() => {
        console.log('[SW] Some images not available for precaching');
      });
    });
  }

  if (event.data && event.data.type === 'DISABLE_IMAGE_CACHE') {
    imageCacheEnabled = false;
    console.log('[SW] Image caching disabled');
  }

  if (event.data && event.data.type === 'CLEAR_IMAGE_CACHE') {
    caches.delete(IMAGE_CACHE).then(() => {
      console.log('[SW] Image cache cleared');
    });
  }
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-http/https requests (e.g., chrome-extension://)
  if (!url.protocol.startsWith('http')) return;

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip API requests
  if (url.pathname.startsWith('/api')) return;

  // Handle image requests - cache first with long-term storage
  // Images rarely change, so serve from cache immediately for speed
  // Include AVIF format for optimized images
  if (request.destination === 'image' || url.pathname.match(/\.(jpg|jpeg|png|gif|webp|avif|svg|heic)$/i)) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then((cache) => {
        return cache.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            // Return cached immediately - don't revalidate every time
            // Images are versioned or rarely change
            return cachedResponse;
          }

          // Not in cache, fetch from network and cache for future
          return fetch(request).then((networkResponse) => {
            if (networkResponse.ok) {
              // Clone and cache the response
              cache.put(request, networkResponse.clone());
            }
            return networkResponse;
          }).catch(() => {
            // Network failed, return placeholder or let browser handle
            return new Response('', { status: 404 });
          });
        });
      })
    );
    return;
  }

  // Handle video requests - cache first
  if (request.destination === 'video' || url.pathname.match(/\.(mov|mp4|webm)$/i)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) => {
        return cache.match(request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;

          return fetch(request).then((networkResponse) => {
            if (networkResponse.ok) {
              cache.put(request, networkResponse.clone());
            }
            return networkResponse;
          });
        });
      })
    );
    return;
  }

  // Handle static assets (JS, CSS) - stale-while-revalidate
  if (url.pathname.match(/\.(js|css)$/)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) => {
        return cache.match(request).then((cachedResponse) => {
          const fetchPromise = fetch(request).then((networkResponse) => {
            if (networkResponse.ok) {
              cache.put(request, networkResponse.clone());
            }
            return networkResponse;
          });

          return cachedResponse || fetchPromise;
        });
      })
    );
    return;
  }

  // Default: Network first, fallback to cache
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(request);
      })
  );
});
