self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = {}
  }
  const title = payload.title || 'Reminder'
  const options = {
    body: payload.body || '',
    data: payload.data || {},
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const planUrl = '/plan/timeline'
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientsArr) => {
        for (const c of clientsArr) {
          if ('focus' in c) return c.focus()
        }
        if (self.clients.openWindow) return self.clients.openWindow(planUrl)
        return null
      }),
  )
})


