const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const upload = require('multer')({ dest: os.tmpdir() });
const config = require('./config');
const { getContext, initContext } = require('./context');

const api = new express.Router();

const dbFilepath = path.resolve(`${config.data}/db`);

const addContext = (req, res, next) => {
  req.ctx = getContext(dbFilepath);
  next();
}

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

const maybeRequireSetup = (req, res, next) => {
  if (!getContext(dbFilepath)) {
    return res.sendStatus(204);
  }
  next();
}

api.get('/', (req, res) => {
  res.redirect('/rp')
})

api.use(maybeRequireSetup, addContext);

module.exports = api;
