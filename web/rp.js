window.RP = (function() {
  var exports = {};

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

  function auth() {
    var passcode = prompt('Please enter the passcode for this room:');
    if (passcode == null) {
      return Promise.reject(new Error('Unauthorized'));
    }
    return fetch('/api/auth', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ passcode: passcode }),
    })
    .then(function (res) {
      return res.json().then(function (json) {
        if (!res.ok) {
          var retry = confirm(`Error: ${json.error}. Retry?`)
          if (retry) {
            return auth();
          } else {
            throw new Error(json.error);
          }
        }
      });
    });
  }

  exports.initialize = function initialize(callbacks) {
    var onmsg = callbacks.msg;
    var onchara = callbacks.chara;
    var ontitle = callbacks.title;
    var onerror = callbacks.error;
    jsonStream('/api/rp/chat', function(update) {
      if (update.type === 'title') {
        ontitle(update.data);
      } else if (update.type === 'msgs') {
        onmsg(update.data);
      } else if (update.type === 'charas') {
        onchara(update.data);
      }
    })
    .catch(function (err) {
      if (err.response && err.response.status === 401) {
        auth().then(initialize.bind(null, callbacks))
        .catch(function (err) {
          onerror(err, true)
        });
      } else {
        onerror(err, false);
        setTimeout(initialize.bind(null, callbacks), 2000);
      }
    })
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
      return data;
    })
    .catch(ALERT_ERROR);
  }

  exports.sendMessage = function sendMessage(data) {
    return sendUpdate('msgs', data);
  }

  exports.sendChara = function sendChara(data) {
    return sendUpdate('charas', data);
  }

  exports.getMessageHistory = function getMessageHistory(_id) {
    return fetch('/api/rp/msgs/' + _id + '/history')
    .then(RESPONSE_OK)
    .then(function (response) { return response.json() })
    .catch(ALERT_ERROR);
  }

  exports.changeTitle = function changeTitle(title) {
    return fetch('/api/rp/title', {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ title: title }),
    })
    .then(RESPONSE_OK)
    .catch(ALERT_ERROR);
  }

  exports.addWebhook = function addWebhook(webhook) {
    return fetch('/api/rp/webhook', {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ webhook: webhook }),
    })
    .then(RESPONSE_OK)
    .catch(ALERT_ERROR);
  }

  exports.getPage = function getPage(pageNumber) {
    return fetch('/api/rp/pages/' + pageNumber)
    .then(RESPONSE_OK)
    .then(function (response) { return response.json() })
    .catch(ALERT_ERROR);
  }

  exports.importJSON = function importJSON(file) {
    return fetch('/api/rp/import', {
      method: 'POST',
      body: file,
    })
    .then(RESPONSE_OK)
    .catch(ALERT_ERROR);
  }
  
  return exports;
  
}());