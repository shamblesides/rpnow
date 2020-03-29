const express = require('express');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');
const os = require('os');
const upload = require('multer')({ dest: os.tmpdir() });
const { generateTextFile } = require('./txt-file');
const Store = require('./storage');
const validate = require('./validate-user-documents');
const Auth = require('./auth');
const discordWebhooks = require('./discord-webhooks');
const temporaryPassphrase = require('./temporary-passphrase');

const CHAT_SCROLLBACK = 10;
const PAGE_LENGTH = 20;

const PASSCODE = process.env.PASSCODE;
const IS_DEMO_MODE = (PASSCODE === 'demo31032016');

// Express is our HTTP server
const server = express();

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
server.use(express.static('web'));

// API
const api = new express.Router();
server.use('/api', api);
api.use((req, res, next) => {
  res.set('Cache-Control', 'no-cache');
  next();
})

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

function getContext(req) {
  const dbFilepath = getDBFilepath(req);
  
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

function getDBFilepath(req) {
  if (IS_DEMO_MODE) {
    return path.resolve(`/tmp/rpdemo-${req.user.userid}`)
  } else {
    return path.resolve('.data/db');
  }
}

function getAuditLogFilepath(req) {
  if (IS_DEMO_MODE) {
    return null;
  } else {
    return path.resolve('.data/audit');
  }
}

function writeAuditLog(req, text) {
  const filepath = getAuditLogFilepath(req);
  if (fs.existsSync(filepath) && fs.statSync(filepath).size > 40000) {
    const lines = fs.readFileSync(filepath, 'utf8').split('\n');
    const clipped = Math.floor(lines.length * .25);
    fs.writeFileSync(filepath, [`--- ${clipped} lines clipped ---`, ...lines.slice(clipped)].join('\n'));
  }
  fs.appendFileSync(filepath, text + '\n');
}

/**
 * Router pertaining to day-to-day RP interaction
 */
const rp = new express.Router();
api.use('/rp', rp);

/**
 * Different behavior for auth/setup for demo vs non-demo
 */
if (!IS_DEMO_MODE) {
  /**
   * Start new RP, or import from file
   */
  api.post('/setup', (req, res, next) => {
    if (getContext(req)) {
      return res.sendStatus(409); // conflict
    } else {
      next();
    }
  }, upload.single('file'), (req, res, next) => {
    if (req.file) {
      try {
        fs.copyFileSync(req.file.path, getDBFilepath(req));
        res.redirect('/');
      } finally {
        fs.unlinkSync(req.file.path);
      }
    } else {
      // Create file (fail if exists)
      fs.writeFileSync(getDBFilepath(req), '', { flag: 'wx' });
      const { setTitle } = getContext(req);
      setTitle(req.body.title);
      res.redirect('/');
    }
  });
  
  // Authentication
  const { generateToken, authMiddleware, checkPasscode } = Auth(PASSCODE);

  /**
   * Generate a new set of credentials for an anonymous user
   */
  api.post('/auth', express.json(), (req, res, next) => {
    const isYes = (value) => ['true', 'yes', 'y'].includes(value.toLowerCase());
    if (!process.env.ALLOW_NEW_USERS || !isYes(process.env.ALLOW_NEW_USERS)) {
      return res.status(403).json({ error: 'New logins not permitted' })
    }
    if (typeof req.body.passcode !== 'string' || req.body.passcode.length > 200) {
      return res.status(400).json({ error: 'Invalid passcode' });
    }
    checkPasscode(req.body.passcode).then(correct => {
      if (!correct) {
        return res.status(401).json({ error: 'Wrong passcode' });
        writeAuditLog(req, 'Invalid login attempt')
      }

      const timestamp = new Date().toISOString();

      const logline = `${timestamp} - New login with room passcode: ${req.body.passcode}`;
      writeAuditLog(req, logline);

      const credentials = generateToken(req.body.passcode);

      res.cookie('usertoken', credentials.token, {
        path: '/api',
        httpOnly: true,
        secure: true,
        // sameSite: 'strict',
      })
      res.cookie('userid', credentials.userid, {
        path: '/',
        httpOnly: false,
        secure: true,
        // sameSite: 'strict',
      })

      res.json(credentials);
    }).catch(next);
  });
  
  api.get('/audit', cookieParser(), authMiddleware, (req, res, next) => {
    const filepath = getAuditLogFilepath(req);
    res.type('text/plain');
    fs.createReadStream(filepath).pipe(res);
  })

  rp.use(cookieParser(), authMiddleware);

  rp.use((req, res, next) => {
    if (!getContext(req)) {
      return res.sendStatus(204);
    }
    next();
  })
} else {
  rp.use(cookieParser(), Auth.demo.middleware);
  
  /**
   * Catch UnauthorizedError and create demo session userid if we don't have one yet
   */
  rp.use((err, req, res, next) => {
    if (err.name === 'UnauthorizedError') {
      const credentials = Auth.demo.generateToken();
      res.cookie('usertoken', credentials.token, {
        path: '/api',
        httpOnly: true,
        secure: true,
        // sameSite: 'strict',
      });
      res.cookie('userid', credentials.userid, {
        path: '/',
        httpOnly: false,
        secure: true,
        // sameSite: 'strict',
      })
      req.user = { userid: credentials.userid, demo: true };
      next();
    } else {
      next(err);
    }
  });
  
  rp.use((req, res, next) => {
    const dbFilepath = getDBFilepath(req);
    if (!fs.existsSync(dbFilepath)) {
      fs.writeFileSync(dbFilepath, '', { flag: 'wx' });
      const { setTitle, Msgs, Charas, Users } = getContext(req);
      setTitle('My Demo RP');
      const meta = { userid: 'u-0000000', timestamp: new Date().toJSON() };
      const [{ _id: cid }] = Charas.put({ name: 'The RP Witch', color: '#8363cd', ...meta })
      Users.put({
        _id: 'u-0000000',
        name: 'DemoBot',
      }),
      Msgs.put({
        type: 'image',
        url: 'https://66.media.tumblr.com/be81b19872926ee3388ebf12c12c8c01/tumblr_ood5t2VSVM1urbwufo1_1280.png',
        ...meta
      })
      Msgs.put({
        type: 'text',
        who: cid,
        content: 'Welcome to the Demo RP! Feel free to test out this app here!',
        ...meta
      })
      const temporaryPassword = 
      Msgs.put({
        type: 'text',
        who: cid,
        content: `When you are ready do this: https://glitch.com/edit/#!/remix/rpnow?ALLOW_NEW_USERS=yes&PASSCODE=%22${temporaryPassphrase().replace(/ /g, '%20')}%22`,
        ...meta
      })
    }
    next();
  });
}

/**
 * Logout
 */
api.post('/logout', (req, res, next) => {
  res.cookie('usertoken', '', {
    path: '/api',
    httpOnly: true,
    maxAge: 0,
  });
  res.redirect('/');
});

/**
 * Get RP info
 * Current state, followed by stream of messages
 * Newline-separated JSONs (expect whitespace that is sent for heartbeat)
 * Can get the current chat stream, or a particular page
 * (a page is also a stream, since it can be edited)
 */
rp.get('/', (req, res, next) => {
  const { Msgs, Charas, Users, getTitle, subscribe } = getContext(req);
  
  const page = parseInt(req.query.page) || null;
  
  const limit = page ? PAGE_LENGTH : CHAT_SCROLLBACK;
  const pageCount = Math.ceil(Msgs.count() / PAGE_LENGTH) || 1;
  
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
rp.get('/download.txt', (req, res, next) => {
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
rp.post('/export', (req, res, next) => {
  const { getTitle, /*dbFilepath*/ } = getContext(req);
  const title = getTitle();
  const dbFilepath = getDBFilepath(req);
  
  res.attachment(`${title}.rprecord`);
  res.sendFile(dbFilepath);
});

/**
 * Add/update msg
 */
rp.put('/msgs', express.json(), (req, res, next) => {
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
rp.put('/charas', express.json(), (req, res, next) => {
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
rp.put('/webhook', express.json(), (req, res, next) => {
  const { Webhooks } = getContext(req);
  const { userid } = req.user;
  const { webhook } = req.body;
  
  if (Webhooks.list().find(doc => doc.webhook === webhook)) {
    throw new Error('That webhook was already added');
  }
  
  Webhooks.put({ webhook, userid });
  
  res.sendStatus(204);
});

/**
 * Update RP title
 */
rp.put('/title', express.json(), (req, res, next) => {
  const { setTitle } = getContext(req);
  
  setTitle(req.body.title);
  res.sendStatus(204);
});

/**
 * Change my username
 */
rp.put('/username', express.json(), (req, res, next) => {
  const { Users } = getContext(req);
  const userid = req.user.userid;
  const name = req.body.name;
  
  Users.put({ _id: userid, name });
  res.sendStatus(204);
})

/**
 * Get a message's edit history
 */ 
rp.get('/msgs/:doc_id([a-z0-9-]+)/history', (req, res, next) => {
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
    res.status(400).json({ error: err.message });
  }
  console.error(err);
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
