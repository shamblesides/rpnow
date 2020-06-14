const express = require('express');
const path = require('path');
const config = require('./config');

const dbFilepath = path.resolve(`${config.data}/db`);

const api = new express.Router();

api.get('/', (req, res) => {
  res.redirect('/rp')
})

/**
 * Add roomFile
 */
api.use((req, res, next) => {
  req.roomFile = dbFilepath;
  next();
});

module.exports = api;
