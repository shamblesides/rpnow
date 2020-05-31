window.RP = (function() {
  var exports = {};
  
  function isOK(xhr) {
    // "ok" responses have a status code that is 200 - 299
    var firstDigit = Math.floor(xhr.status / 100);
    return firstDigit === 2;
  }
  
  function alertError(err) {
    alert(err);
    throw err;
  }
  
  function xhrPromiseResult(resolve, reject) {
    if (isOK(this)) {
      resolve(this.response)
    } else if (this.status > 0) {
      var details;
      if (typeof this.response === 'object') {
        details = this.response.error || JSON.stringify(details);
      } else if (typeof this.response === 'string') {
        try {
          details = JSON.parse(this.response).error || this.response;
        } catch (err) {
          details = this.response;
        }
      } else {
        details = this.response;
      }
      var err = new Error(`${this.status} ${this.statusText} - ${details}`);
      err.status = this.status;
      reject(err);
    } else {
      reject(new Error('Connection error'));
    }
  }
  
  function request(method, url, body, contentType) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.onloadend = xhrPromiseResult.bind(xhr, resolve, reject);
      xhr.open(method, url);
      xhr.responseType = 'json';
      if (contentType) {
        xhr.setRequestHeader('Content-Type', contentType);
      }
      if (body) {
        xhr.send(body);
      } else {
        xhr.send();
      }
    });
  }
  
  function requestWithJSON(method, url, bodyObject) {
    return request(method, url, JSON.stringify(bodyObject), 'application/json');
  }

  function jsonStream(url, cb) {
    var xhr = new XMLHttpRequest();
    
    var readFrom = 0;
    
    xhr.onprogress = function() {
      if (this.status !== 200) return;
      
      var idx;
      while (((idx = this.response.indexOf('\n', readFrom))) !== -1) {
        var json = this.response.substring(readFrom, idx);
        var obj = JSON.parse(json);
        cb(obj);
        readFrom = idx+1;
      }
    }
    
    return new Promise(function(resolve, reject) {
      xhr.onloadend = xhrPromiseResult.bind(xhr, resolve, reject);
      xhr.open('GET', url);
      xhr.send();
    }).then(function() {
      return xhr;
    })
  }

  function auth() {
    var passcode = prompt('Please enter the passcode for this room:');
    if (passcode == null) {
      return Promise.reject(new Error('No passcode provided'));
    }
    
    return requestWithJSON('POST', '/api/auth', { passcode: passcode })
    .catch(function (err) {
      var retry = confirm(`Failed to authenticate. Retry? (${err})`);
      if (retry) {
        return auth();
      } else {
        throw err;
      }
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
      }
    })
    .then(function (xhr) {
      if (xhr.status === 204) { // No content
        history.replaceState(null, '', 'setup.html');
        location.reload();
      } else {
        // This stream isn't supposed to complete. If it does, that means that
        // the request has terminated for some reason. So, throw an error.
        throw new Error('Lost connection! Trying to reconnect...');
      }
    })
    .catch(function (err) {
      if (err.status === 401) { // Not logged in
        auth()
        .then(function() {
          retry()
        })
        .catch(function (err) {
          onerror(err)
        });
      } else if (err.status) { // Server responded, but with some other error
        onerror(err);
      } else { // Connection error. We will retry
        onerror(err, true);
        setTimeout(retry, 6000);
      }
    })
  }

  exports.sendMessage = function sendMessage(data, callback) {
    return requestWithJSON('PUT', '/api/rp/msgs', data)
    .catch(alertError)
    .then(callback)
  }

  exports.sendChara = function sendChara(data, callback) {
    return requestWithJSON('PUT', '/api/rp/charas', data)
    .catch(alertError)
    .then(callback)
  }

  exports.getMessageHistory = function getMessageHistory(_id, callback) {
    return request('GET', `/api/rp/msgs/${_id}/history`)
    .catch(alertError)
    .then(callback)
  }

  exports.changeTitle = function changeTitle(title, callback) {
    return requestWithJSON('PUT', '/api/rp/title', { title: title })
    .catch(alertError)
    .then(callback)
  }

  exports.changeMyUsername = function changeMyUsername(name, callback) {
    return requestWithJSON('PUT', '/api/rp/username', { name: name })
    .catch(alertError)
    .then(callback)
  }

  exports.addWebhook = function addWebhook(webhook, callback) {
    return requestWithJSON('PUT', '/api/rp/webhook', { webhook: webhook })
    .catch(alertError)
    .then(callback)
  }
  
  exports.checkForUpdates = function checkForUpdates() {
    return request('GET', '/api/version')
    .then(function (versions) {
      if (versions.current === versions.latest) {
        return new Promise(function() {}); // never return
      } else {
        return versions;
      }
    })
  }
  
  Object.defineProperty(exports, 'myUserID', { get: function() {
    var cookieName = 'userid';
    var cookieMatch = document.cookie.match('(^|[^;]+)\\s*' + cookieName + '\\s*=\\s*([^;]+)');
    return cookieMatch ? cookieMatch.pop() : '';
  } });
  
  return exports;
  
}());
