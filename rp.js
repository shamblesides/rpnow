window.RP = (function() {
  var exports = {};
  
  function alertError(err) {
    alert(err);
    throw err;
  }

  var ID = (function() {
    var counter = 0;
    return function ID(prefix) {
      prefix = prefix || '';
      var date = Date.now().toString(36).padStart(9, 0);
      var num = (counter++ % 36**6).toString(36).padStart(6,0)
      var rand = Math.random().toString(36).slice(2);
      return prefix + date + num + rand;
    }
  }());

  exports.initialize = function initialize(roomid, page, callbacks) {
    var onready = callbacks.ready;
    var onmsg = callbacks.msg;
    var onchara = callbacks.chara;
    var ontitle = callbacks.title;
    var onuser = callbacks.user;
    var onpagecount = callbacks.pageCount;
    var onerror = callbacks.error;

    userbase.init({ appId: '8dcdb794-f6c1-488d-966d-0058b5889c93' })
    .then(function () {
      var isFirstUpdate = true;
      // TODO: hopefully at some point, the API for Userbase will change
      // so that we get notified of the exact changes, rather than having
      // to figure them out ourselves. At that point, we probably won't
      // need this Map anymore
      // Also if we ever implement Deletes then this will fail to notice
      // them soooo
      var previousObjectReferences = new Map();

      userbase.openDatabase({
        databaseName: roomid,
        changeHandler(changes) {
          try {
            changes.forEach(function (change) {
              if (previousObjectReferences.get(change.itemId) === change.item) {
                return;
              }
              if (change.itemId === 'title') {
                ontitle(change.item);
              } else if (change.itemId.startsWith('m-')) {
                var obj = Object.assign({ _id: change.itemId }, change.item);
                onmsg(obj, isFirstUpdate);
              } else if (change.itemId.startsWith('c-')) {
                var obj = Object.assign({ _id: change.itemId }, change.item);
                onchara(obj, isFirstUpdate);
              }
              previousObjectReferences.set(change.itemId, change.item);
            })
            if (isFirstUpdate) {
              onpagecount(changes.filter(c => c.itemId.startsWith('m-')).length || 1);
              onready(isFirstUpdate);
              isFirstUpdate = false;
            }
          } catch (err) {
            onerror(err);
          }
        }
      })
      .then(function() {
        // connected!
        if (!previousObjectReferences.has('title')) {
          userbase.insertItem({
            databaseName: roomid,
            itemId: 'title',
            item: 'Untitled',
          })
        }
      })
      .catch(function (err) {
        // window.location.replace('/auth');
        onerror(err);
        // onerror(err, true);
      })
    })
  }

  function upsert(collection, data, callback) {
    var isUpdate = !!data._id;

    var itemId = data._id || ID(collection);

    var item = Object.assign({}, data);
    delete item._id;

    var method = isUpdate ? 'updateItem' : 'insertItem';

    var params = {
      databaseName: roomid,
      itemId: itemId,
      item: item,
    }

    userbase[method](params)
    .catch(alertError)
    .then(callback.bind(null, data))
  }

  exports.sendMessage = function sendMessage(data, callback) {
    upsert('m-', data, callback);
  }

  exports.sendChara = function sendChara(data, callback) {
    upsert('c-', data, callback);
  }

  exports.getMessageHistory = function getMessageHistory(_id, callback) {
    return request('GET', `api/msgs/${_id}/history`)
    .catch(alertError)
    .then(callback)
  }

  exports.changeTitle = function changeTitle(title) {
    userbase.updateItem({
      databaseName: roomid,
      itemId: 'title',
      item: title,
    })
    .catch(alertError)
  }

  exports.changeMyUsername = function changeMyUsername(name, callback) {
    return requestWithJSON('PUT', 'api/username', { name: name })
    .catch(alertError)
    .then(callback)
  }

  exports.addWebhook = function addWebhook(webhook, callback) {
    return requestWithJSON('PUT', 'api/webhook', { webhook: webhook })
    .catch(alertError)
    .then(callback)
  }
  
  exports.checkForUpdates = function checkForUpdates() {
    return request('GET', '/version')
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
