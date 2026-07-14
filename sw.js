// ============================================================================
// Essence POS — Service Worker (PWA، خطوة 8أ)
// دور هاد الملف: يخبي "قشرة" التطبيق (essence-app.html + الخطوط + lucide + مكتبة
// supabase-js) باش يفتح حتى بلا انترنت. ماشي مسؤول على بيانات المحل (منتجات/بيوعات/...) —
// هاديك كتدارها outbox ديال IndexedDB لي مبنية فـ essence-app.html نفسها (خطوة 8ب).
//
// قرار مهم: طلبات *.supabase.co (API الحقيقي) ماكيتخبأوش هنا أبدا — كنخليوهم يفوتو
// للشبكة مباشرة (يفشلو بلا انترنت وهادشي عادي، الـ outbox هو لي كيتكفل بالإعادة).
// ============================================================================

const CACHE_VERSION = 'essence-shell-v1';
const APP_SHELL = [
  './essence-app.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

function isSupabaseRequest(url) {
  return url.hostname.endsWith('supabase.co');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // POST/PATCH/DELETE (كتابة Supabase) ماخاصهاش تتخبأ أبدا

  const url = new URL(req.url);
  if (isSupabaseRequest(url)) return; // خلي طلبات Supabase تفوت مباشرة للشبكة، بلا تدخل SW

  // Network-first لـ essence-app.html نفسها: بغينا آخر نسخة كل ما كاين انترنت، وكاش كـ fallback بوحدو
  const isAppShellDoc = req.mode === 'navigate' || url.pathname.endsWith('essence-app.html');
  if (isAppShellDoc) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('./essence-app.html')))
    );
    return;
  }

  // باقي الموارد (خطوط/lucide/supabase-js CDN/أيقونات): cache-first، وتخزين أي نسخة جديدة فالخلفية
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
