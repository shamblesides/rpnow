/* global Vue */

export var webpage = Vue.observable({
  visible: (document.visibilityState === 'visible'),
  hash: location.hash,
})

document.addEventListener('visibilitychange', function() {
  webpage.visible = (document.visibilityState === 'visible')
})

window.addEventListener('hashchange', function() {
  webpage.hash = location.hash;
})

var JSON_HEADERS = { 'Content-Type': 'application/json' };

var RESPONSE_OK = function (response) {
  if (response.ok) {
    return response
  } else {
    return response.text()
    .then(function (data) {
      var err = null;
      try {
        return JSON.parse(data).error || data;
      } catch (parseErr) {
        return data;
      }
    })
    .then(function (text) {
      throw new Error(`${response.status} ${response.statusText} - ${text}`);
    })
  }
};

var ALERT_ERROR = function (err) {
  alert(err)
  throw err;
}

function jsonStream(url, cb) {
  // feature detection to possibly polyfill a version of fetch that supports streaming
  var nativeFetchStreams = ('body' in Response.prototype);
  var fetch = nativeFetchStreams ? window.fetch : window.fetchStream;
  // console.log('Native fetch streams? ' + nativeFetchStreams)

  return fetch(url).then(function(response) {
    if (!response.ok) {
      var err = new Error(response.status + ' ' + response.statusText)
      err.response = response;
      throw err;
    }

    var utf8 = new TextDecoder();
    var reader = response.body.getReader();
    var partial = '';

    function loop() {
      return reader.read().then(function(chunk) {
        if (chunk.done) {
          throw new Error('server ended stream');
        }

        partial += utf8.decode(chunk.value);
        var lines = partial.split('\n');
        partial = lines.pop();

        lines.forEach(function (line) {
          var json = line.trim();
          if (json.length === 0) return;
          var value = JSON.parse(json)
          cb(value);
        })

        return loop();
      })
    }
    return loop();
  })
}

export var state = Vue.observable({
  loaded: false,
  error: null,
  title: null,
  msgs: null,
  charas: null,
});

function auth() {
  var passcode = prompt('Please enter the passcode for this room:');
  if (passcode == null) {
    state.error = 'Unauthorized'
    return
  }
  fetch('/api/auth', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ passcode: passcode }),
  })
  .then(function (res) {
    return res.json().then(function (json) {
      if (!res.ok) {
        var retry = confirm(`Error: ${json.error}. Retry?`)
        if (retry) {
          auth();
        } else {
          state.error = json.error;
        }
      } else {
        initialize();
      }
    });
  });
}

export function initialize() {
  jsonStream('/api/rp/chat', updateState)
  .catch(function (err) {
    if (err.response && err.response.status === 401) {
      auth();
    } else {
      state.error = err;
      setTimeout(initialize, 2000);
    }
  })
}

function updateState(update) {
  if (update.type === 'title') {
    state.title = update.data;
  } else {
    state[update.type] = (state[update.type] || [])
      .filter(function (item) { return item._id !== update.data._id })
      .concat([update.data])
      .sort(function (a, b) { return a._id < b._id ? -1 : 1 });
    
    // keep no more than 60 messages
    if (update.type === 'msgs') {
      state.msgs = state.msgs.slice(-60);
    }
  }
}

function sendUpdate(type, body) {
  return fetch('/api/rp/' + type, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  })
  .then(RESPONSE_OK)
  .then(function (response) { return response.json() })
  .then(function (data) {
    updateState({ data: data, type: type })
    return data;
  })
  .catch(ALERT_ERROR);
}

export function sendMessage(data) {
  return sendUpdate('msgs', data);
}

export function sendChara(data) {
  return sendUpdate('charas', data);
}

export function getMessageHistory(_id) {
  return fetch('/api/rp/msgs/' + _id + '/history')
  .then(RESPONSE_OK)
  .then(function (response) { return response.json() })
  .catch(ALERT_ERROR);
}

export function changeTitle(title) {
  return fetch('/api/rp/title', {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify({ title: title }),
  })
  .then(RESPONSE_OK)
  .then(function () {
    state.title = title
  })
  .catch(ALERT_ERROR);
}

export function addWebhook(webhook) {
  return fetch('/api/rp/webhook', {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify({ webhook: webhook }),
  })
  .then(RESPONSE_OK)
  .catch(ALERT_ERROR);
}

export function getPage(pageNumber) {
  return fetch('/api/rp/pages/' + pageNumber)
  .then(RESPONSE_OK)
  .then(function (response) { return response.json() })
  .catch(ALERT_ERROR);
}

export function importJSON(file) {
  return fetch('/api/rp/import', {
    method: 'POST',
    body: file,
  })
  .then(RESPONSE_OK)
  .catch(ALERT_ERROR);
}