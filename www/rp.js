window.RP = (function() {
  var AUX_URL = 'https://rpnow-aux.herokuapp.com'
  // var AUX_URL = 'http://localhost:13002'

  var exports = {};

  var PAGE_SIZE = exports.PAGE_SIZE = 20;
  var CHAT_SIZE = exports.CHAT_SIZE = 60;

  var myUsername;
  var dbArgs;
  var databaseId;
  var auxAuthToken;
  
  var initPromise;

  var lastChanges = null;

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

  exports.initialize = function initialize(_databaseId, page, callbacks) {
    databaseId = _databaseId;
    if (!databaseId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)) {
      throw new Error('The URL for this RP has changed. Go back to your dashboard.')
    }

    var onready = callbacks.ready;
    var onmsg = callbacks.msg;
    var onchara = callbacks.chara;
    var ontitle = callbacks.title;
    var onpagecount = callbacks.pageCount;
    var onerror = callbacks.error;


    initPromise = userbase.init({
      appId: '630241a7-b753-44d0-a7de-358fe646cc27',
      sessionLength: 365 * 24,
    })
    .then(function (session) {
      if (!session.user) {
        throw new Error('You are not logged in!')
      }
      myUsername = session.user.username;
      return userbase.getDatabases({ databaseId: databaseId })
      .then(function (results) {
        if (results.databases.length === 0) {
          throw new Error('RP Not Found');
        }
        dbArgs = results.databases[0].isOwner
          ? { databaseName: results.databases[0].databaseName }
          : { databaseId: databaseId }
        auxAuthToken = session.user.authToken
      })
    })
    .then(function () {
      var rpMetaDocId = dbArgs.databaseName || dbArgs.databaseId;
      var rpMetaDoc = null
      var metaDbOpenPromise = userbase.openDatabase({
        databaseName: 'dashboard-cache',
        changeHandler(changes) {
          if (rpMetaDoc) return
          var change = changes.find(function (change) {
            return change.itemId === rpMetaDocId
          })
          if (change) {
            rpMetaDoc = change.item
          }
        }
      })
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
          lastChanges = changes
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
                metaDbOpenPromise.then(function () {
                  var method = (rpMetaDoc == null) ? 'insertItem' : 'updateItem'
                  if (rpMetaDoc == null) {
                    rpMetaDoc = {}
                  }
                  rpMetaDoc.title = change.item
                  userbase[method]({ databaseName: 'dashboard-cache', itemId: rpMetaDocId, item: rpMetaDoc })
                })
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
                var currentPageMsgIds = (page >= 1 ? pagesMsgIds[page-1] : chatMsgIds)
                if (!currentPageMsgIds) {
                  throw new Error(`Page ${page} does not exist`)
                }
                var isMessageVisible = currentPageMsgIds.includes(change.itemId);
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
    fetch(AUX_URL + '/message', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Token': auxAuthToken,
        'X-Database-Id': databaseId,
      },
    })
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

  exports.getParticipantInfo = function getParticipantInfo(callback) {
    userbase.getDatabases(dbArgs).then(function (result) {
      var users = result.databases[0].users
      var canShare = result.databases[0].resharingAllowed
      callback(users, canShare)
    })
  }

  exports.inviteUser = function inviteUser(username) {
    var shareDatabaseParams = Object.assign({
      username: username,
      readOnly: false,
    }, dbArgs);

    userbase.shareDatabase(shareDatabaseParams)
    .then(function () {
      alert('Invite sent')
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
          alert('Invite sent')
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

  exports.uninviteUser = function uninviteUser(username, callback) {
    var params = { username: username, revoke: true }
    Object.assign(params, dbArgs)

    userbase.modifyDatabasePermissions(params)
    .then(callback)
    .catch(alertError)
  }

  exports.setWritePermission = function setWritePermission (username, canWrite, callback) {
    var params = { username: username, readOnly: !canWrite }
    Object.assign(params, dbArgs)

    userbase.modifyDatabasePermissions(params)
    .then(callback)
    .catch(alertError)
  }

  exports.setSharePermission = function setSharePermission(username, canShare, callback) {
    var params = { username: username, resharingAllowed: canShare }
    Object.assign(params, dbArgs)

    userbase.modifyDatabasePermissions(params)
    .then(callback)
    .catch(alertError)
  }

  exports.downloadTXT = function downloadTXT(includeOOC) {
    var names = {}

    function wordwrap(str, indent='', width=72) {
      width -= indent.length;
      var regex = RegExp('.{0,' +width+ '}(\\s|$)|.{' +width+ '}|.+$', 'g');
      var lines = str.trim().match(regex).map(function(line) { return line.trimRight() });
      if (lines[lines.length-1] === '') lines.pop();
      return indent + lines.join('\n'+indent);
    }
    function msgText(msg) {
      if (msg.who === 'narrator') {
        return wordwrap(msg.content);
      } else if (msg.who === 'ooc') {
        return wordwrap(`(( OOC: ${msg.content} ))`);
      } else {
        var name = names[msg.who] || 'UNKNOWN CHARA';
        var indentedContent = wordwrap(msg.content, '  ');
        return `${name.toUpperCase()}:\n${indentedContent}`;
      }
    }

    var lines = []
    function write(str) {
      lines.push(str.replace(/\n/g, '\r\n'), '\r\n\r\n');
    }

    var titleChange = lastChanges.find(function(x) { return x.itemId === 'title' })
    var title = titleChange.item.toString()
    write(title)
    write('-------------')

    for (var change of lastChanges) {
      if (change.itemId.startsWith('m-')) {
        var msg = change.item
        if (typeof msg !== 'object') continue
        if (msg.type === 'text') {
          if (msg.who === 'ooc' && !includeOOC) continue;
          var msgBlock = msgText(msg);
          write(msgBlock);
        } else if (msg.type === 'image') {
          write(`--- IMAGE ---\n${msg.url}\n-------------`)
        }
      } else if (change.itemId.startsWith('c-')) {
        names[change.itemId] = change.item.name
      }
    }

    var filename = `${title.replace(/[^a-zA-Z ]/g, "")}.txt`
    var file = new File(lines, filename, { type: 'text/plain' })
    var url = URL.createObjectURL(file)
    var a = document.createElement('a')
    a.href = url
    a.target = '_blank'
    a.download = filename
    a.click()
  }

  exports.downloadJSON = function downloadJSON() {
    var meta = { title: null, charas: [] }
    var charasIndexForId = {}

    var separator = ',\n'
    var strings = ['[\n', null]
    function addMessage(obj) {
      strings.push(separator, JSON.stringify(obj));
    }
    function updateMeta() {
      strings[1] = JSON.stringify(meta)
    }
    function endFile() {
      strings.push('\n]')
    }

    var titleChange = lastChanges.find(function(x) { return x.itemId === 'title' })
    meta.title = titleChange.item.toString()

    for (var change of lastChanges) {
      if (change.itemId.startsWith('m-')) {
        if (typeof change.item !== 'object') continue
        var msg = {
          timestamp: change.item.timestampOverride || change.createdBy.timestamp,
          type: (change.item.who && change.item.who.startsWith('c-')) ? 'chara' : (change.item.who || change.item.type)
        }
        if (change.item.type === 'text') {
          msg.content = change.item.content
          if (charasIndexForId[change.item.who] != null) msg.charaId = charasIndexForId[change.item.who]
        } else if (change.item.type === 'image') {
          msg.url = change.item.url
        }
        addMessage(msg)
      } else if (change.itemId.startsWith('c-')) {
        charasIndexForId[change.itemId] = meta.charas.length
        meta.charas.push({
          timestamp: change.item.timestampOverride || change.createdBy.timestamp,
          name: change.item.name,
          color: change.item.color,
        })
      }
    }

    updateMeta()
    endFile()

    var filename = `${meta.title.replace(/[^a-zA-Z ]/g, "")}.json`
    var file = new File(strings, filename, { type: 'application/json' })
    var url = URL.createObjectURL(file)
    var a = document.createElement('a')
    a.href = url
    a.target = '_blank'
    a.download = filename
    a.click()
  }

  exports.setupNotifications = function setupNotifications() {
    navigator.serviceWorker.register('notification-sw.js')
    navigator.serviceWorker.ready.then(function (registration) {
      initPromise.then(function() {
        registration.active.postMessage({
          action: 'setup',
          url: AUX_URL+'/subscribe',
          token: auxAuthToken
        })
      })
    })
  }

  exports.stopNotifications = function stopNotifications() {
    navigator.serviceWorker.ready.then(function (registration) {
      registration.pushManager.getSubscription().then(function (subscription) {
        if (subscription) {
          subscription.unsubscribe().then(function () {
            registration.showNotification('Notifications stopped')
          })
        } else {
          registration.showNotification('Notifications were already stopped')
        }
      })
    })
  }

  return exports;

}());
