const express = require('express');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const { generateTextFile } = require('./services/txt-file');
const { exportRp, importRp } = require('./services/json-file');
const Store = require('./services/storage');
const validate = require('./services/validate-user-documents');
const { generateToken, authMiddleware, checkPasscode } = require('./services/auth')(process.env.PASSCODE);
const discordWebhooks = require('./services/discord-webhooks');

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

// Attach prefetch headers to load frontend files more quickly
const prefetchHeader = [
  ...fs.readdirSync('web/components').map(f => `components/${f}`),
  ...fs.readdirSync('web')
].filter(f => f.endsWith('.js') || f.endsWith('.css'))
.map(f => {
  const type = ({js:'script',css:'style'})[f.split('.').pop()];
  return `<${f}>; rel=prefetch; as=${type}`;
})
.join(', ');

server.get('/', (req, res, next) => {
  res.set('Link', prefetchHeader);
  next();
})

// Serve frontend HTML, etc
server.use('/', express.static('web', { index: 'index2.html' }));

// DB tables
const db = Store('./.data/db');

const Msgs = db.group('m-', validate.msg)
const Charas = db.group('c-', validate.chara)
const Webhooks = db.group('webhook-', validate.webhook)
const getTitle = () => (db.find('title') || { title: 'My New Story' }).title;
const setTitle = (title) => db.put({ _id: 'title', title });

// API
const api = new express.Router();
server.use('/api', api);
api.use(cookieParser());
api.use((req, res, next) => {
  res.set('Cache-Control', 'no-cache');
  next();
})
api.use(authMiddleware.unless({path: ['/api/auth']}))

const rpListeners = new Set();

function broadcast(obj) {
  rpListeners.forEach(fn => fn(obj))
}

/**
 * Generate a new set of credentials for an anonymous user
 */
api.post('/auth', express.json(), (req, res, next) => {
  if (!process.env.ALLOW_NEW_USERS || !['true', 'yes', 'y'].includes(process.env.ALLOW_NEW_USERS.toLowerCase())) {
    return res.status(403).json({ error: 'New logins not permitted' })
  }
  checkPasscode(req.body.passcode).then(correct => {
    if (!correct) {
      return res.status(401).json({ error: 'Wrong passcode' })
    }

    const credentials = generateToken(req.body.passcode);

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
let importStatus = null;

api.post('/rp/import', (req, res, next) => {
  const { userid } = req.user;
  
  // forbid import when RP is not empty
  if (Msgs.count() > 0) {
    return res.sendStatus(409) // conflict
  }
  
  req.on('end', () => {
    importStatus = { status: 'pending' };
    res.sendStatus(202);
  });

  importRp(req, { userid }, {
    addMsgs(msgs) {
      console.log(msgs);
      // return Msgs.put(...msgs);
    },
    addCharas(charas) {
      console.log(charas);
      return Charas.put(...charas);
    },
    setTitle(title) {
      console.log(title);
      return setTitle(title);
    },
    onComplete(err) {
      // TODO notify chat ?
      if (err) {
        importStatus = { status: 'error', error: err.message };
      } else  {
        importStatus = { status: 'success' };              
      }
    }
  });
});

/**
 * RP Chat Stream
 */
api.get('/rp/chat', (req, res, next) => {
  const send = (...objs) => res.write(objs.map(obj => JSON.stringify(obj)).join('\n')+'\n')
  
  // TODO if import is in progress, send notice and then wait

  const msgs = Msgs.list({ reverse: true, limit: 60 }).reverse();
  const charas = Charas.list();
  const title = getTitle();
  
  send(
    ({ type: 'title', data: title }),
    ...charas.map(data => ({ type: 'charas', data })),
    ...msgs.map(data => ({ type: 'msgs', data })),
  );
  
  rpListeners.add(send);
  res.on("close", () => rpListeners.delete(send));
});

/**
 * Get a page from an RP's archive
 */
api.get('/rp/pages/:pageNum([1-9][0-9]{0,})', (req, res, next) => {
  const msgCount = Msgs.count();
  const pageCount = Math.ceil(msgCount / 20);
  
  const skip = (req.params.pageNum - 1) * 20;
  const limit = 20;
  const msgs = Msgs.list({ skip, limit });

  res.status(200).json({ msgs, pageCount })
});

/**
 * Get and download a .txt file for an entire RP
 */
api.get('/rp/download.txt', (req, res, next) => {
  const msgs = Msgs.iterator();
  const charas = Charas.list();
  const title = getTitle();
  const { includeOOC = false } = req.query;

  res.attachment(`${title}.txt`).type('.txt');
  generateTextFile({ title, msgs, charas, includeOOC }, str => res.write(str));
  res.end();
});

/**
 * Get and download a .txt file for an entire RP
 */
api.get('/rp/export', (req, res, next) => {
  const msgs = Msgs.iterator();
  const charas = Charas.list();
  const title = getTitle();
  
  res.attachment(`${title}.json`).type('.json');
  exportRp({ title, msgs, charas }, str => res.write(str));
  res.end();
});

/**
 * Add/update msg
 */
api.put('/rp/msgs', express.json(), (req, res, next) => {
  const { userid } = req.user;
  const timestamp = new Date().toISOString();
  const obj = { ...req.body, userid, timestamp };

  const [doc] = Msgs.put(obj);
  broadcast({ type: 'msgs', data: doc })

  res.status(200).json(doc);
  
  if (!obj._id) { // if adding a new msg, send webhook 
    try {
      const webhooks = Webhooks.list().map(obj => obj.webhook);
      const chara = obj.charaId && Charas.find(obj.charaId);
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
  res.status(200).json(Msgs.history(_id));
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
