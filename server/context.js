const fs = require('fs');
const Store = require('./storage');
const validate = require('./validate-user-documents');

// A context object will store some DB connections etc
function context(dbFilepath) {
  // Message bus. Users connect upon entering chat
  const rpListeners = new Set();
  
  function broadcast(obj) {
    rpListeners.forEach(fn => fn(obj))
  }
  
  function subscribe(callback) {
    rpListeners.add(callback);
    return () => rpListeners.delete(callback);
  }
  
  // Database
  const db = Store(dbFilepath);
  
  const Msgs =     db.prefix('m-').constrain(validate.msg).autoid()
  const Charas =   db.prefix('c-').constrain(validate.chara).autoid()
  const Users =    db.prefix('u-').constrain(validate.user);
  const Webhooks = db.prefix('webhook-').constrain(validate.webhook).autoid()
  
  Msgs.updates.on('update', data => broadcast({ type: 'msgs', data }));
  Charas.updates.on('update', data => broadcast({ type: 'charas', data }));
  Users.updates.on('update', data => broadcast({ type: 'users', data }));

  const getTitle = () => db.find('title').title;
  function setTitle(title) {
    if (typeof title !== 'string') throw new Error('invalid title');
    if (title.length > 30) throw new Error('title too long');
    if (!title) throw new Error('missing title');
    db.put({ _id: 'title', title });
    broadcast({ type: 'title', data: title });
  }
  
  return {
    subscribe,
    Msgs,
    Charas,
    Users,
    Webhooks,
    getTitle,
    setTitle,
    dbFilepath,
  }
}

// Get context
const contextCache = new Map();

module.exports = function getContext(dbFilepath) {
  if (contextCache.has(dbFilepath)) {
    return contextCache.get(dbFilepath);
  } else if (fs.existsSync(dbFilepath)) {
    const myContext = context(dbFilepath);
    contextCache.set(dbFilepath, myContext);
    return myContext;
  } else {
    return null;
  }
}
