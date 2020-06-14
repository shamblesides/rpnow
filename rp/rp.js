const express = require('express');
const fs = require('fs');
const path = require('path');
const { generateTextFile } = require('./txt-file');
const discordWebhooks = require('./discord-webhooks');
const { getContext: DB } = require('../server/context')

const config = {
  chatScrollback: 10,
  pageLength: 20,
}

// req.ctx should be set in a prior middleware
const getContext = (req) => DB(req.roomFile);

const router = new express.Router();

const api = new express.Router();
router.use('/api', api);

api.use((req, res, next) => {
  if (!req.user) {
    res.status(401).json({ error: 'No credentials' });
  } else {
    next();
  }
})

// Serve frontend HTML, etc
router.use(express.static(path.resolve(__dirname, './web')));

// Load custom css/js in the server's working directory
for (const file of ['custom.css', 'custom.js']) {
  const filepath = path.resolve(file);
  router.get('/'+file, (req, res, next) => {
    if (fs.existsSync(filepath)) {
      res.sendFile(filepath);
    } else {
      res.sendStatus(204);
    }
  });
}

/**
 * Get RP info
 * Current state, followed by stream of messages
 * Newline-separated JSONs (expect whitespace that is sent for heartbeat)
 * Can get the current chat stream, or a particular page
 * (a page is also a stream, since it can be edited)
 */
api.get('/', (req, res, next) => {
  const { Msgs, Charas, Users, getTitle, subscribe } = getContext(req);
  
  const page = parseInt(req.query.page) || null;
  
  const limit = page ? config.pageLength : config.chatScrollback;
  const pageCount = Math.ceil(Msgs.count() / config.pageLength) || 1;
  
  if (page !== null && !(page >= 1 && page <= pageCount)) {
    throw new RangeError('invalid page');
  }

  if (!Users.has(req.user.userid)) {
    Users.put({ _id: req.user.userid, name: `User ${Math.random().toString().slice(-3)}` });
  }
  
  res.type('text/plain');
  
  // Send big blank because an empty or very small RP will
  // get buffered for some reason
  res.write(Array(10000).fill(' ').join(''));
  
  const send = (obj) => {
    res.write(JSON.stringify(obj)+'\n');
  }
  
  const msgs = (page == null)
    ? Msgs.list({ reverse: true, limit }).reverse()
    : Msgs.list({ skip: (page-1)*limit, limit });
  const charas = Charas.list();
  const users = Users.list();
  const title = getTitle();
  
  send({
    type: 'init',
    data: { msgs, charas, title, users, pageCount }
  });
  
  function onUpdate(update) {
    // only allow new messages to pass through
    // OR messages that are on-screen that have been edited
    if (update.type === 'msgs') {
      if (msgs.find(msg => msg._id === update.data._id)) {
        // meh... maybe replace it if we centralize this logic later
      } else if (msgs.length === 0 || update.data._id > msgs[msgs.length-1]._id) {
        if (msgs.length == limit) {
          // drop new messages if we're on a specific page that has been filled
          if (page) return;
          // otherwise scroll past the least recent msg
          else msgs.shift();
        }
        msgs.push(update.data);
      } else {
        return;
      }
    }
    send(update);
  }
  
  const unsubscribe = subscribe(onUpdate);
  
  var heartbeatTimer = setInterval(() => {
    res.write(' ');
  }, 15000);
  
  res.on("close", () => {
    clearInterval(heartbeatTimer);
    unsubscribe();
  });
});

/**
 * Get and download a .txt file for an entire RP
 */
api.post('/download.txt', (req, res, next) => {
  const { Msgs, Charas, getTitle } = getContext(req);

  const msgs = Msgs.iterator();
  const charas = Charas.list();
  const title = getTitle();
  const { includeOOC = false } = req.query;

  const str = generateTextFile({ title, msgs, charas, includeOOC });
  
  res.attachment(`${title}.txt`)
  res.type('text/plain');
  res.send(str);
});

/**
 * Export database
 */
api.post('/export', (req, res, next) => {
  const { getTitle, dbFilepath } = getContext(req);
  const title = getTitle();
  
  res.attachment(`${title}.rprecord`);
  res.sendFile(dbFilepath);
});

/**
 * Add/update msg
 */
api.put('/msgs', express.json(), (req, res, next) => {
  const { Msgs, Webhooks, Charas, getTitle } = getContext(req);
  
  const { userid } = req.user;
  const timestamp = new Date().toISOString();
  const obj = { ...req.body, userid, timestamp };
  
  if (req.body._id && Msgs.has(req.body._id) && Msgs.find(req.body._id).userid !== userid) {
    return res.status(403).json({ error: "Not allowed: tried to modify someone else's message" });
  }

  const [doc] = Msgs.put(obj);

  res.json(doc);
  
  if (!obj._id) { // if adding a new msg, send webhook 
    try {
      const webhooks = Webhooks.list().map(obj => obj.webhook);
      const chara = obj.type === 'text' && obj.who.startsWith('c-') && Charas.find(obj.who);
      const title = getTitle();
      discordWebhooks.send(webhooks, title, obj, chara);
    } catch (err) {
      // don't crash client response, just log it
      console.info(err);
    }
  }
});

/**
 * Add/update chara
 */
api.put('/charas', express.json(), (req, res, next) => {
  const { Charas } = getContext(req);

  const { userid } = req.user;
  const timestamp = new Date().toISOString();
  const obj = { ...req.body, userid, timestamp };
  
  if (req.body._id && Charas.has(req.body._id) && Charas.find(req.body._id).userid !== userid) {
    return res.status(403).json({ error: "Not allowed: tried to modify someone else's character" });
  }

  const [doc] = Charas.put(obj);

  res.json(doc);
});

/**
 * Add webhook
 */
api.post('/webhook', express.urlencoded({ extended: false }), (req, res, next) => {
  const { Webhooks } = getContext(req);
  const { userid } = req.user;
  const { webhook } = req.body;
  
  if (Webhooks.list().find(doc => doc.webhook === webhook)) {
    throw new Error('That webhook was already added');
  }
  
  Webhooks.put({ webhook, userid });
  
  res.redirect('/settings.html');
});

/**
 * Update RP title
 */
api.post('/title', express.urlencoded({ extended: false }), (req, res, next) => {
  const { setTitle } = getContext(req);
  
  setTitle(req.body.title);
  res.redirect('/settings.html');
});

/**
 * Change my username
 */
api.put('/username', express.json(), (req, res, next) => {
  const { Users } = getContext(req);
  const userid = req.user.userid;
  const name = req.body.name;
  
  Users.put({ _id: userid, name });
  res.sendStatus(204);
})

/**
 * Get a message's edit history
 */ 
api.get('/msgs/:doc_id([a-z0-9-]+)/history', (req, res, next) => {
  const { Msgs, Users } = getContext(req);
  const _id = req.params.doc_id;
  const msgs = Msgs.history(_id);
  msgs.forEach(msg => {
    // add extra username prop for convenience
    const user = Users.find(msg.userid);
    if (user) msg.username = user.name;
  });
  res.json(msgs);
});

module.exports = router;
