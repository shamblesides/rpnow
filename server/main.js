#!/usr/bin/env node

const express = require('express');
const fs = require('fs');
const path = require('path');
const version = require('../package.json').version
const fetch = require('node-fetch');
const config = require('./config');
const rp = require('./rp');
const demoAPI = require('./demo');
const singleAPI = require('./single');
const passcodeAuth = require('./passcode');
const noAuth = require('./unsecured');

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

if (config.isDemoMode) {
  api.use(noAuth);
} else {
  api.use(passcodeAuth);
}

if (config.isDemoMode) {
  api.use(demoAPI);
} else {
  api.use(singleAPI);
}

api.use('/rp', rp)

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
