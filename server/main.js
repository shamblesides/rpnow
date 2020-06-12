#!/usr/bin/env node

console.info(`RPNow Server ${require('../package.json').version}`);

const express = require('express');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const rp = require('../rp/rp');
const versionCheck = require('./version');
const demoAPI = require('./demo');
const singleAPI = require('./single');
const passcodeAuth = require('./passcode');
const noAuth = require('./unsecured');

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

// TODO
// api.use((req, res, next) => {
//   res.set('Cache-Control', 'no-cache');
//   next();
// })

server.get('/version', versionCheck)

server.get('/favicon.ico', (_, res) => res.sendStatus(404));

if (config.isDemoMode) {
  server.use(noAuth);
} else {
  server.use(passcodeAuth);
}

if (config.isDemoMode) {
  server.use(demoAPI);
} else {
  server.use(singleAPI);
}

server.use('/rp', rp)

/**
 * Default route (route not found)
 */
server.all('*', (req, res, next) => {
  next(new Error('unknown request'));
});

/**
 * Error handling
 */
server.use((err, req, res, next) => {
  res.status(400).json({ error: err.message });
  console.error(err);
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
