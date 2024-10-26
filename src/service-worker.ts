const sw = self as unknown as ServiceWorkerGlobalScope;

// TODO: PWA化, 現在は画像のみキャッシュするようにしている

// Fetch Event
sw.addEventListener("fetch", (event) => {
  // cache only images
  if (event.request.destination === "image") {
    event.respondWith(
      caches.match(event.request).then((response) => {
        return (
          response ||
          fetch(event.request).then((response) => {
            return caches.open("images").then((cache) => {
              cache.put(event.request, response.clone());
              return response;
            });
          })
        );
      }),
    );
  }
});
