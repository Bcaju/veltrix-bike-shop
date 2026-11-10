"use strict";

self.addEventListener("install", event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});



self.addEventListener("push", event => {
  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {
      title: "VELTRIX",
      body: event.data ? event.data.text() : "Захиалгын төлөв шинэчлэгдлээ."
    };
  }

  const title = data.title || "VELTRIX";
  const options = {
    body: data.body || "Таны захиалгын төлөв шинэчлэгдлээ.",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: "veltrix-order-update",
    renotify: true,
    data: {
      url: data.url || "/"
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();

  const targetUrl = new URL(
    event.notification.data?.url || "/",
    self.location.origin
  ).href;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true
    });

    for (const client of windows) {
      if (client.url.startsWith(self.location.origin)) {
        await client.focus();
        if ("navigate" in client) {
          await client.navigate(targetUrl);
        }
        return;
      }
    }

    await self.clients.openWindow(targetUrl);
  })());
});
