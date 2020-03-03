window.RP = (function() {
  var exports = {};
  
  function isOK(xhr) {
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
      reject(new Error('Network error'));
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
    })
    .then(function () {
      throw new Error('Server ended stream');
    })
  }

  function auth(name) {
    var passcode = prompt('Please enter the passcode for this room:');
    if (passcode == null) {
      return Promise.reject(new Error('Unauthorized'));
    }
    if (!name) {
      name = prompt('And what is your name? (as in you, the writer?)')
      if (!name) return Promise.reject(new Error('No name'))
    }
    
    return requestWithJSON('POST', '/api/auth', { passcode: passcode, name: name })
    .catch(function (err) {
      var retry = confirm(`Failed to authenticate. Retry? (${err})`);
      if (retry) {
        return auth(name);
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
      } else if (update.type === 'reload') {
        location.reload();
      }
    })
    .catch(function (err) {
      if (err.status === 401) {
        auth()
        .then(retry)
        .catch(function (err) {
          onerror(err, true)
        });
      } else if (err.status) {
        onerror(err, true);
      } else {
        onerror(err, false);
        setTimeout(retry, 6000);
      }
    })
  }

  exports.sendMessage = function sendMessage(data) {
    return requestWithJSON('PUT', '/api/rp/msgs', data)
    .catch(alertError)
  }

  exports.sendChara = function sendChara(data) {
    return requestWithJSON('PUT', '/api/rp/charas', data)
    .catch(alertError)
  }

  exports.getMessageHistory = function getMessageHistory(_id) {
    return request('GET', `/api/rp/msgs/${_id}/history`)
    .catch(alertError)
  }

  exports.changeTitle = function changeTitle(title) {
    return requestWithJSON('PUT', '/api/rp/title', { title: title })
    .catch(alertError)
  }

  exports.addWebhook = function addWebhook(webhook) {
    return requestWithJSON('PUT', '/api/rp/webhook', { webhook: webhook })
    .catch(alertError)
  }

  exports.importJSON = function importJSON(file) {
    return request('POST', '/api/rp/import', file)
    .catch(alertError)
  }
  
  return exports;
  
}());
