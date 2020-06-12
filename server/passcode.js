const express = require('express');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');
const Auth = require('./auth');
const config = require('./config');

const api = new express.Router();

// Authentication
const { generateToken, authMiddleware, checkPasscode } = Auth(config.passcode);

function getAuditLogFilepath(req) {
  return path.resolve(`${config.data}/audit`);
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

api.get('/auth', cookieParser(), authMiddleware, (req, res) => {
  if (req.user) {
    res.send(`<p>You already entered the passcode.<p><a href="/">Continue</a>`);
  } else {
    res.sendFile(path.resolve(__dirname, './web/passcode.html'))
  }
});

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

    res.cookie('usertoken', credentials.token, { httpOnly: true });
    res.cookie('userid', credentials.userid, { httpOnly: false });

    res.json(credentials);
  }).catch(next);
});

api.get('/audit', cookieParser(), authMiddleware, (req, res, next) => {
  const filepath = getAuditLogFilepath(req);
  res.type('text/plain');
  fs.createReadStream(filepath).pipe(res);
})

/**
 * Logout
 */
api.post('/logout', (req, res, next) => {
  res.cookie('usertoken', '', { httpOnly: true, maxAge: 0 });
  res.redirect('/');
});

const catchRevokedToken = (err, req, res, next) => {
  if (err.code === 'revoked_token' || err.code === 'invalid_token') {
    delete req.user;
  }
  next();
}

api.use(cookieParser(), authMiddleware, catchRevokedToken);

module.exports = api;
