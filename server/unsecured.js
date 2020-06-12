const express = require('express');
const cookieParser = require('cookie-parser');
const Auth = require('./auth');

const api = new express.Router();

api.get('/audit', (req, res, next) => {
  res.type('text/plain');
  res.send('No audit logs kept on unsecured server.')
})

api.post('/logout', (req, res, next) => {
  res.cookie('usertoken', '', { httpOnly: true, maxAge: 0 });
  res.redirect('/');
});

/**
 * Catch UnauthorizedError and create demo session userid if we don't have one yet
 */
const autoAuth = (req, res, next) => {
  if (!req.user) {
    const credentials = Auth.demo.generateToken();
    res.cookie('usertoken', credentials.token, { httpOnly: true });
    res.cookie('userid', credentials.userid, { httpOnly: false });
    // TODO demo=true is not always appropriate
    req.user = { userid: credentials.userid, demo: true };
  }
  next();
};

api.use('/rp', cookieParser(), Auth.demo.middleware(), autoAuth);

module.exports = api;
