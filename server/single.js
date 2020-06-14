const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const upload = require('multer')({ dest: os.tmpdir() });
const config = require('./config');
const { getContext, initContext } = require('./context');

const dbFilepath = path.resolve(`${config.data}/db`);

const api = new express.Router();

api.get('/', (req, res) => {
  res.redirect('/rp')
})

/**
 * Start new RP, or import from file
 */
api.post('/setup', (req, res, next) => {
  if (getContext(dbFilepath)) {
    return res.sendStatus(409); // conflict
  } else {
    next();
  }
}, upload.single('file'), (req, res, next) => {
  if (req.file) {
    try {
      fs.copyFileSync(req.file.path, dbFilepath);
      res.redirect('/');
    } finally {
      fs.unlinkSync(req.file.path);
    }
  } else {
    const { setTitle } = initContext(dbFilepath);
    setTitle(req.body.title);
    res.redirect('/');
  }
});

/**
 * If it's not set up, then respond with 204 to indicate this
 */
api.use((req, res, next) => {
  if (!getContext(dbFilepath)) {
    return res.sendStatus(204);
  } else {
    next();
  }
});

/**
 * Add roomFile
 */
api.use((req, res, next) => {
  req.roomFile = dbFilepath;
  next();
});

module.exports = api;
