#!/usr/bin/env node

const express = require('express');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');
const os = require('os');
const upload = require('multer')({ dest: os.tmpdir() });
const version = require('../package.json').version
const Store = require('./storage');
const validate = require('./validate-user-documents');
const Auth = require('./auth');
const fetch = require('node-fetch');
const config = require('./config');
const rp = require('./rp');

console.info(`RPNow Server ${version}`);

// Create data directory if it doesn't exist
if (!fs.existsSync(config.data)) {
  const fullPath = path.resolve(config.data);
  console.info(`Creating new data directory at ${fullPath}`);
  fs.mkdirSync(config.data);
}

// Express is our HTTP server
const server = express();

// Add x-robots-tag header to all pages served by app 
server.use((req, res, next) => {
  res.set('X-Robots-Tag', 'noindex');
  next();
});

// Redirect all HTTP routes to HTTPS
server.use((req, res, next) => {
  const forwardedProto = req.get('X-Forwarded-Proto');
  if (forwardedProto && forwardedProto.indexOf("https") === -1){
    res.redirect('https://' + req.hostname + req.url);
  } else {
    next()
  }
});

// Serve frontend HTML, etc
server.use(express.static(path.resolve(__dirname, '../web')));

// Load custom css/js in the current directory
for (const file of ['custom.css', 'custom.js']) {
  server.get('/'+file, (req, res, next) => {
    if (fs.existsSync(file)) {
      res.sendFile(path.resolve(file));
    } else {
      res.sendStatus(204);
    }
  });
}

// API
const api = new express.Router();
server.use('/api', api);
api.use((req, res, next) => {
  res.set('Cache-Control', 'no-cache');
  next();
})

api.get('/version', (req, res, next) => {
  fetch(`https://registry.npmjs.org/${require('../package.json').name}`)
  .then(res => res.json())
  .then(data => data['dist-tags'].latest)
  .then(latest => {
    res.json({
      current: version,
      latest,
    })
  })
  .catch(err => {
    console.error(err);
    res.json({
      current: version,
      latest: version,
    })
  })
  .catch(next);
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

const addContext = (req, res, next) => {
  req.ctx = getContext(req);
  next();
}

function getDBFilepath(req) {
  if (config.isDemoMode) {
    return path.resolve(os.tmpdir(), `rpdemo-${req.user.userid}`)
  } else {
    return path.resolve(`${config.data}/db`);
  }
}

/**
 * Different behavior for auth/setup for demo vs non-demo
 */
if (!config.isDemoMode) {
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
  const { generateToken, authMiddleware, checkPasscode } = Auth(config.passcode);

  function getAuditLogFilepath(req) {
    if (config.isDemoMode) {
      return null;
    } else {
      return path.resolve(`${config.data}/audit`);
    }
  }

  function writeAuditLog(req, text) {
    const filepath = getAuditLogFilepath(req);
    if (fs.existsSync(filepath) && fs.statSync(filepath).size > 40000) {
      const lines = fs.readFileSync(filepath, 'utf8').split('\n');
      const clipped = Math.floor(lines.length * .25);
      fs.writeFileSync(filepath, [`--- ${clipped} lines clipped ---`, ...lines.slice(clipped)].join('\n'));
    }
    
    const timestamp = new Date().toUTCString();
    fs.appendFileSync(filepath, `${timestamp} - ${text}\n`);
  }

  /**
   * Generate a new set of credentials for an anonymous user
   */
  api.post('/auth', express.json(), (req, res, next) => {
    if (config.lockdown) {
      return res.status(403).json({ error: 'New logins not permitted' })
    }
    if (typeof req.body.passcode !== 'string' || req.body.passcode.length > 200) {
      return res.status(400).json({ error: 'Invalid passcode' });
    }
    checkPasscode(req.body.passcode).then(correct => {
      if (!correct) {
        writeAuditLog(req, 'Invalid login attempt')
        return res.status(401).json({ error: 'Wrong passcode' });
      }

      writeAuditLog(req, `New login with room passcode: ${req.body.passcode}`);

      const credentials = generateToken(req.body.passcode);

      res.cookie('usertoken', credentials.token, {
        path: '/api',
        httpOnly: true,
      })
      res.cookie('userid', credentials.userid, {
        path: '/',
        httpOnly: false,
      })

      res.json(credentials);
    }).catch(next);
  });
  
  api.get('/audit', cookieParser(), authMiddleware, (req, res, next) => {
    const filepath = getAuditLogFilepath(req);
    res.type('text/plain');
    fs.createReadStream(filepath).pipe(res);
  })

  const maybeRedirectToSetup = (req, res, next) => {
    if (!getContext(req)) {
      return res.sendStatus(204);
    }
    next();
  }

  api.use('/rp', cookieParser(), authMiddleware, maybeRedirectToSetup, addContext, rp);
} else {
  api.get('/audit', (req, res, next) => {
    res.type('text/plain');
    res.send('Audit logs not enabled in demo mode.')
  })
  
  /**
   * Catch UnauthorizedError and create demo session userid if we don't have one yet
   */
  const autoAuth = (err, req, res, next) => {
    if (err.name === 'UnauthorizedError') {
      const credentials = Auth.demo.generateToken();
      res.cookie('usertoken', credentials.token, {
        path: '/api',
        httpOnly: true,
      });
      res.cookie('userid', credentials.userid, {
        path: '/',
        httpOnly: false,
      })
      req.user = { userid: credentials.userid, demo: true };
      next();
    } else {
      next(err);
    }
  };
  
  const populateRP = (req, res, next) => {
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
      Msgs.put({
        type: 'text',
        who: cid,
        content: 'When you are ready, go here to find out how to make your own server on glitch.com: https://glitch.com/edit/#!/remix/rpnow?PASSCODE=%22Change%20me%22&LOCKDOWN=no',
        ...meta
      })
    }
    next();
  };

  api.use('/rp', cookieParser(), Auth.demo.middleware(), autoAuth, populateRP, addContext, rp);
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
    console.error(err);
  }
});

// start server
const listener = server.listen(config.port, (err) => {
  if (err) {
    console.error(`Failed to start: ${err}`);
    process.exit(1);
  } else {
    console.info("Your app is listening on port " + listener.address().port);
  }
});
