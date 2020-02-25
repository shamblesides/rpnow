// TODO consider using XHR instead of fetch, so we drop 4 polyfills

window.RP = (function() {
  var exports = {};
  
  var utf8 = new TextDecoder();

  var JSON_HEADERS = { 'Content-Type': 'application/json' };

  var RESPONSE_OK = function (response) {
    if (response.ok) {
      return response;
    } else {
      // Compatibility layer for when this is applied to a polyfilled fetchStream
      // If we stop polyfilling fetch, we can safely assume ('text' in response) === true
      return (
        ('text' in response)
        ? response.text()
        : (function readmore (reader) {
            return reader.read().then(function (chunk) {
              return chunk.done ? '' : readmore(reader).then(function(str) { return utf8.decode(chunk.value) + str });
            })
          }(response.body.getReader()))
      )
      .then(function (data) {
        try {
          return JSON.parse(data).error || data;
        } catch (parseErr) {
          return data;
        }
      })
      .then(function (text) {
        var err = new Error(`${response.status} ${response.statusText} - ${text}`);
        err.response = response;
        throw err;
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

    return fetch(url)
    .then(RESPONSE_OK)
    .then(function(response) {
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

  function auth(name) {
    var passcode = prompt('Please enter the passcode for this room:');
    if (passcode == null) {
      return Promise.reject(new Error('Unauthorized'));
    }
    while (!name) {
      name = prompt('And what is your name? (as in you, the writer?)')
    }
    return fetch('/api/auth', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ passcode: passcode, name: name }),
    })
    .then(function (res) {
      return res.json().then(function (json) {
        if (!res.ok) {
          var retry = confirm(`Error: ${json.error}. Retry?`)
          if (retry) {
            return auth(name);
          } else {
            throw new Error(json.error);
          }
        }
      });
    });
  }

  exports.initialize = function initialize(page, callbacks) {
    var retry = initialize.bind(null, page, callbacks);
    
    var oninit = callbacks.init;
    var onmsg = callbacks.msg;
    var onchara = callbacks.chara;
    var ontitle = callbacks.title;
    var onuser = callbacks.user;
    var onerror = callbacks.error;
    
    jsonStream(`/api/rp?page=${page}`, function(update) {
      if (update.type === 'init') {
        oninit(update.data);
      } else if (update.type === 'title') {
        ontitle(update.data);
      } else if (update.type === 'msgs') {
        onmsg(update.data);
      } else if (update.type === 'charas') {
        onchara(update.data);
      } else if (update.type === 'users') {
        onuser(update.data);
      } else if (update.type === 'reload') {
        location.reload();
      }
    })
    .catch(function (err) {
      if (err.response && err.response.status === 401) {
        auth()
        .then(retry)
        .catch(function (err) {
          onerror(err, true)
        });
      } else if (err.response && err.response.ok === false) {
        onerror(err, true);
      } else {
        onerror(err, false);
        setTimeout(retry, 6000);
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