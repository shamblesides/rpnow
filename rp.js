window.RP = (function() {
  var exports = {};

  var PAGE_SIZE = exports.PAGE_SIZE = 20;
  var CHAT_SIZE = exports.CHAT_SIZE = 60;

  var myUsername;
  var dbArgs;
  
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
    var onpagecount = callbacks.pageCount;
    var onerror = callbacks.error;

    dbArgs = (roomid.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i))
      ? { databaseId: roomid }
      : { databaseName: roomid };

    userbase.init({ appId: '630241a7-b753-44d0-a7de-358fe646cc27' })
    .then(function (session) {
      if (!session.user) {
        throw new Error('You are not logged in!')
      }
      myUsername = session.user.username;
      return userbase.getDatabases(dbArgs)
      .then(function (results) {
        if (results.databases.length === 0) {
          throw new Error('RP Not Found');
        }
      })
    })
    .then(function () {
      var isFirstUpdate = true;
      // TODO: hopefully at some point, the API for Userbase will change
      // so that we get notified of the exact changes, rather than having
      // to figure them out ourselves. At that point, we probably won't
      // need this Map anymore
      // Also if we ever implement Deletes then this will fail to notice
      // them soooo
      var previousObjectReferences = new Map();

      var chatMsgIds = [];
      var pagesMsgIds = [];

      return userbase.openDatabase(Object.assign({
        changeHandler(changes) {
          try {
            if (isFirstUpdate) {
              var allMsgIds = changes
                .map(function (x) { return x.itemId })
                .filter(function (x) { return x.startsWith('m-') });
              chatMsgIds = allMsgIds.slice(-CHAT_SIZE);
              while (allMsgIds.length > 0) {
                pagesMsgIds.push(allMsgIds.splice(0, PAGE_SIZE));
              }
              if (pagesMsgIds.length === 0) {
                pagesMsgIds.push([]);
              }
              onpagecount(pagesMsgIds.length);
            }
            changes.forEach(function (change) {
              if (previousObjectReferences.get(change.itemId) === change.item) {
                return;
              }
              if (change.itemId === 'title') {
                ontitle(change.item);
              } else if (change.itemId.startsWith('m-')) {
                if (!isFirstUpdate && !previousObjectReferences.has(change.itemId)) {
                  chatMsgIds.push(change.itemId);
                  if (chatMsgIds.length > CHAT_SIZE) {
                    chatMsgIds.shift();
                  }
                  if (pagesMsgIds[pagesMsgIds.length-1].length === PAGE_SIZE) {
                    pagesMsgIds.push([]);
                    onpagecount(pagesMsgIds.length);
                  }
                  pagesMsgIds[pagesMsgIds.length-1].push(change.itemId)
                }
                var isMessageVisible = (page >= 1 ? pagesMsgIds[page-1] : chatMsgIds).includes(change.itemId);
                if (isMessageVisible) {
                  var obj = {
                    _id: change.itemId,
                    _user: (change.updatedBy || change.createdBy).username,
                    _rev: +!!change.updatedBy,
                  }
                  Object.assign(obj, change.item);
                  onmsg(obj, isFirstUpdate);
                }
              } else if (change.itemId.startsWith('c-')) {
                var obj = {
                  _id: change.itemId,
                  _user: (change.updatedBy || change.createdBy).username,
                  _rev: +!!change.updatedBy,
                }
                Object.assign(obj, change.item);
                onchara(obj, isFirstUpdate);
              }
              previousObjectReferences.set(change.itemId, change.item);
            })
            if (isFirstUpdate) {
              onready(isFirstUpdate);
              isFirstUpdate = false;
            }
          } catch (err) {
            onerror(err);
          }
        }
      }, dbArgs))
    })
    .catch(function (err) {
      // window.location.replace('/auth');
      onerror(err);
      // onerror(err, true);
    })
  }

  function upsert(collection, data, callback, failCallback) {
    var isUpdate = !!data._id;

    var itemId = data._id || ID(collection);

    var item = Object.assign({}, data);
    for (var k in item) {
      if (k.startsWith('_')) {
        delete item[k];
      }
    }

    var method = isUpdate ? 'updateItem' : 'insertItem';

    userbase[method](Object.assign({
      itemId: itemId,
      item: item,
    }, dbArgs))
    .catch(function (err) {
      if (failCallback) failCallback(err);
      return alertError(err);
    })
    .then(function (data) {
      if (callback) callback(data);
    });
  }

  exports.sendMessage = function sendMessage(data, callback, failCallback) {
    upsert('m-', data, callback, failCallback);
  }

  exports.sendChara = function sendChara(data, callback) {
    upsert('c-', data, callback);
  }

  exports.changeTitle = function changeTitle(title) {
    userbase.updateItem(Object.assign({
      itemId: 'title',
      item: title,
    }, dbArgs))
    .catch(alertError)
  }

  Object.defineProperty(exports, 'myUsername', { get: function() {
    return myUsername;
  } });

  exports.inviteUser = function inviteUser(username) {
    var shareDatabaseParams = Object.assign({
      username: username,
      readOnly: false,
    }, dbArgs);

    userbase.shareDatabase(shareDatabaseParams)
    .then(function () {
      alert('Invite successful')
    })
    .catch(function (err) {
      if (err.name !== 'UserNotVerified') {
        throw err;
      }
      var code = prompt(`You've never invited ${username} to an RP before! Please ask for their verification code to make sure it's them.`);
      if (code == null) {
        return;
      }
      return userbase.verifyUser({ verificationMessage: code })
      .then(function () {
        return userbase.shareDatabase(shareDatabaseParams)
        .then(function () {
          alert('Invite successful')
        })
        .catch(function (err) {
          if (err.name === 'UserNotVerified') {
            throw new Error(`Invite failed: This code does not belong to ${username}!`);
          } else {
            throw new Error(`Successfully verified user, but invite failed: ${err.message}`);
          }
        })
      })
    })
    .catch(function (err) {
      alert(err.message);
    })
  }
  
  return exports;
  
}());
