// This will be called only once when the service worker is activated.
self.addEventListener('activate', function () {
  console.log('RP Service Worker installed!')
})

self.addEventListener('message', function (event) {
  console.log(event.data)

  if (event.data.action === 'setup') {
    setupSubscription(event.data.url, event.data.token)
  } else if (event.data.action === 'title') {
    rememberTitle(event.data.databaseId, event.data.title)
  }
})

self.addEventListener('push', function (event) {
  console.log(event)
  var data = event.data.json()
  if (data.test === 'ok') {
    return event.waitUntil(self.registration.showNotification('Subscribed to RPNow push notifications'))
  } else if (data.update) {
    return event.waitUntil(self.registration.showNotification('New RP Message', {
      actions: [{ action: `open ${data.update.databaseId}`, title: 'Read' }]
    }))
  }
})

self.addEventListener('notificationclick', function (event) {
  event.notification.close()

  console.log(event.action)

  if (event.action.startsWith('open ')) {
    var roomId = event.action.substr(5)
    var promise = clients.matchAll({ type: 'window' })
    .then(function (clientList) {
      var client = clientList.find(c => c.url.endsWith(`?room=${roomId}`))
      if (client) return client.focus()
      else if (clients.openWindow) return clients.openWindow(`/rp.html?room=${roomId}`)
    })

    return event.waitUntil(promise)
  }
})

function setupSubscription(url, token) {
  self.registration.pushManager.getSubscription().then(function (existingSubscription) {
    if (existingSubscription) return existingSubscription

    // var applicationServerKey = "BH65dM6/Kc1I9fXdujbCcnkKaJEAMCD2AZdleKh2agvimEPmasK3CNNV9aFngcA5Xjg3ODogLcEbZZhTzjhNci0="
    var applicationServerKey = Uint8Array.from([4, 126, 185, 116, 206, 191, 41, 205, 72, 245, 245, 221, 186, 54, 194, 114, 121, 10, 104, 145, 0, 48, 32, 246, 1, 151, 101, 120, 168, 118, 106, 11, 226, 152, 67, 230, 106, 194, 183, 8, 211, 85, 245, 161, 103, 129, 192, 57, 94, 56, 55, 56, 58, 32, 45, 193, 27, 101, 152, 83, 206, 56, 77, 114, 45])
    var options = {
      applicationServerKey: applicationServerKey,
      userVisibleOnly: true
    };
    return self.registration.pushManager.subscribe(options)
  }).then(function (subscription) {
    console.log(JSON.stringify(subscription))
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Token': token,
        'X-Subscription': JSON.stringify(subscription),
      },
    })
  });
}

function rememberTitle(databaseId, title) {
  // TODO
}
