const express = require('express');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');
const os = require('os');
const upload = require('multer')({ dest: os.tmpdir() });
const { generateTextFile } = require('./services/txt-file');
const Store = require('./services/storage');
const validate = require('./services/validate-user-documents');
const { generateToken, authMiddleware, checkPasscode } = require('./services/auth')(process.env.PASSCODE);
const discordWebhooks = require('./services/discord-webhooks');

const CHAT_SCROLLBACK = 10;
const PAGE_LENGTH = 20;

// Message bus. Users connect upon entering chat
const rpListeners = new Set();

function broadcast(obj) {
  rpListeners.forEach(fn => fn(obj))
}

// DB tables
const dbFilepath = path.resolve('.data/db');
let db;
let Msgs;
let SystemMsgs;
let Charas;
let Users;
let Webhooks;
const getTitle = () => (db.find('title') || { title: 'My New Story' }).title;
const setTitle = (title) => db.put({ _id: 'title', title });

function loadDB() {
  db = Store(dbFilepath);
  
  // TODO attach broadcast() directly to db table defs
  // TODO db.group('m-').constrain????(validate.userMsg????)
  Msgs = db.group('m-', validate.msg)
  SystemMsgs = db.group('m-', validate.systemMsg)
  Charas = db.group('c-', validate.chara)
  Users = db.group('u-', validate.user);
  Webhooks = db.group('webhook-', validate.webhook)
}

loadDB();

// Express is our HTTP server
const server = express();

// compress
server.use(compression());

// Add x-robots-tag header to all pages served by app 
server.use((req, res, next) => {
  res.set('X-Robots-Tag', 'noindex');
  next();
});

// Redirect all HTTP routes to HTTPS
server.use((req, res, next) => {
  if(req.get('X-Forwarded-Proto').indexOf("https")!=-1){
    next()
  } else {
    res.redirect('https://' + req.hostname + req.url);
  }
});

// Serve frontend HTML, etc
server.use('/', express.static('web'));

// API
const api = new express.Router();
server.use('/api', api);
api.use(cookieParser());
api.use((req, res, next) => {
  res.set('Cache-Control', 'no-cache');
  next();
})
api.use(authMiddleware.unless({path: ['/api/auth']}))

/**
 * Generate a new set of credentials for an anonymous user
 */
api.post('/auth', express.json(), (req, res, next) => {
  const yesValues = ['true', 'yes', 'y'];
  if (!process.env.ALLOW_NEW_USERS || !yesValues.includes(process.env.ALLOW_NEW_USERS.toLowerCase())) {
    return res.status(403).json({ error: 'New logins not permitted' })
  }
  checkPasscode(req.body.passcode).then(correct => {
    if (!correct) {
      return res.status(401).json({ error: 'Wrong passcode' })
    }
    
    const name = req.body.name;
    const timestamp = new Date().toISOString();
    
    // TODO broadcast
    const [{ _id: userid }] = Users.put({ name });
    
    // TODO broadcast
    SystemMsgs.put({ type: 'login', userid, name, timestamp });

    const credentials = generateToken(userid, req.body.passcode);

    res.cookie('usertoken', credentials.token, {
      path: '/api',
      maxAge: 1000 * 60 * 60 * 24 * 365 * 5, // 5 years
      httpOnly: true,
      secure: true,
      // sameSite: 'strict',
    })

    res.status(200).json(credentials);
  }).catch(next);
});

/**
 * Import RP from JSON
 */
api.post('/rp/import', (req, res, next) => {
  return next(); // TODO remove
  // forbid import when there are more than a couple messages
  if (Msgs.count() >= CHAT_SCROLLBACK) {
    return res.sendStatus(409); // conflict
  } else {
    next();
  }
}, upload.single('file'), (req, res, next) => {
  try {
    fs.copyFileSync(req.file.path, dbFilepath);
    loadDB();

    broadcast({ type: 'reload' });

    res.redirect('/');
  } finally {
    fs.unlinkSync(req.file.path);
  }
});

/**
 * Get RP info
 * Current state, followed by stream of messages
 * Newline-separated JSONs (expect whitespace that is sent for heartbeat)
 * Can get the current chat stream, or a particular page
 * (a page is also a stream, since it can be edited)
 */
api.get('/rp', (req, res, next) => {
  res.set('Content-Type', 'text/plain');
  
  const page = parseInt(req.query.page) || null;
  
  const limit = page ? PAGE_LENGTH : CHAT_SCROLLBACK;
  const pageCount = Math.ceil(Msgs.count() / PAGE_LENGTH);
  const maxAllowedPage = Math.floor(Msgs.count() / PAGE_LENGTH) + 1;
  
  if (page !== null && !(page >= 1 && page <= maxAllowedPage)) {
    throw new RangeError('invalid page');
  }
  
  const send = (obj) => {
    res.write(JSON.stringify(obj)+'\n');
    if (res.flush) res.flush();
  }
  
  // TODO if import is in progress, send notice and then wait

  
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
  
  rpListeners.add(onUpdate);
  
  var heartbeatTimer = setInterval(() => {
    res.write(' ');
    if (res.flush) res.flush();
  }, 15000);
  
  res.on("close", () => {
    clearInterval(heartbeatTimer);
    rpListeners.delete(onUpdate)
  });
});

/**
 * Get and download a .txt file for an entire RP
 */
api.get('/rp/download.txt', (req, res, next) => {
  const msgs = Msgs.iterator();
  const charas = Charas.list();
  const title = getTitle();
  const { includeOOC = false } = req.query;

  const str = generateTextFile({ title, msgs, charas, includeOOC });
  
  res.attachment(`${title}.txt`).type('.txt');
  res.send(str);
});

/**
 * Export database
 */
api.post('/rp/export', (req, res, next) => {
  const title = getTitle();
  
  res.attachment(`${title}.rprecord`);
  res.sendFile(dbFilepath);
});

/**
 * Add/update msg
 */
api.put('/rp/msgs', express.json(), (req, res, next) => {
  const { userid } = req.user;
  const timestamp = new Date().toISOString();
  const obj = { ...req.body, userid, timestamp };

  const [doc] = Msgs.put(obj);
  console.log(doc); 
  broadcast({ type: 'msgs', data: doc })

  res.status(200).json(doc);
  
  if (!obj._id) { // if adding a new msg, send webhook 
    try {
      const webhooks = Webhooks.list().map(obj => obj.webhook);
      const chara = obj.who.startsWith('c-') && Charas.find(obj.who);
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
api.put('/rp/charas', express.json(), (req, res, next) => {
  const { userid } = req.user;
  const timestamp = new Date().toISOString();
  const obj = { ...req.body, userid, timestamp };

  const [doc] = Charas.put(obj);
  broadcast({ type: 'charas', data: doc })

  res.status(200).json(doc);
});

/**
 * Add webhook
 */
api.put('/rp/webhook', express.json(), (req, res, next) => {
  const { userid } = req.user;
  const { webhook } = req.body;
  
  if (Webhooks.list().find(doc => doc.webhook === webhook)) {
    return res.status(400).json({ error: 'That webhook was already added'});
  }
  
  Webhooks.put({ webhook, userid });
  
  res.sendStatus(204);
});

/**
 * Update RP title
 */
api.put('/rp/title', express.json(), (req, res, next) => {
  const title = req.body
    && req.body.title
    && (typeof req.body.title === 'string')
    && req.body.title.length < 30
    && req.body.title;
  
  if (!title) {
    throw new Error('invalid title');
  }
  
  setTitle(title);
  broadcast({ type: 'title', data: title })
  res.sendStatus(204);
});

/**
 * Get the history of something in an RP (message, chara, etc)
 */ 
api.get('/rp/msgs/:doc_id([a-z0-9-]+)/history', (req, res, next) => {
  const _id = req.params.doc_id;
  const msgs = Msgs.history(_id);
  msgs.forEach(msg => {
    // add extra username prop for convenience
    msg.username = (Users.findOrFail(msg.userid)).name;
  });
  res.status(200).json(msgs);
});

/**
 * Default route (route not found)
 */
api.all('*', (req, res, next) => {
  next(new Error('unknown request'));
});

/**
 * Error handling
 */
api.use((err, req, res, next) => {
  if (err.name === 'UnauthorizedError') {
    res.status(401).json({ error: err.message });
  } else {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});

// start server
const listener = server.listen(process.env.PORT || 13000, (err) => {
  if (err) {
    console.error(`Failed to start: ${err}`);
    process.exit(1);
  } else {
    console.info("Your app is listening on port " + listener.address().port);
  }
});
