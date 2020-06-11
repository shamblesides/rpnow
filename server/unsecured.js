const express = require('express');
const cookieParser = require('cookie-parser');
const Auth = require('./auth');

const api = new express.Router();

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

api.use('/rp', cookieParser(), Auth.demo.middleware(), autoAuth);

module.exports = api;
