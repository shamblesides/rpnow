// [START initialize_firebase_in_sw]
// Give the service worker access to Firebase Messaging.
// Note that you can only use Firebase Messaging here, other Firebase libraries
// are not available in the service worker.
importScripts('https://www.gstatic.com/firebasejs/7.21.1/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/7.21.1/firebase-messaging.js');
// Initialize the Firebase app in the service worker by passing in
// your app's Firebase config object.
// https://firebase.google.com/docs/web/setup#config-object


firebase.initializeApp({
  apiKey: "AIzaSyDh8fmR0-iUvvO6GIbqvTOPxFwAolSe9CQ",
  projectId: "rpnow-d2607",
  messagingSenderId: "266004075056",
  appId: "1:266004075056:web:989052fa24bf7e56de93f5"
});

 
// Retrieve an instance of Firebase Messaging so that it can handle background
// messages.
var messaging = firebase.messaging();
// [END initialize_firebase_in_sw]


// If you would like to customize notifications that are received in the
// background (Web app is closed or not in browser focus) then you should
// implement this optional method.

// [START background_handler]
messaging.setBackgroundMessageHandler(function(payload) {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);

  var notificationTitle = 'Background Message Title';
  var notificationOptions = {
    body: 'Background Message body.',
  };

  return self.registration.showNotification('New Message!', {
    body: "Click to view."
  }
});
// [END background_handler]
