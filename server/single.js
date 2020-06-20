const express = require('express');
const path = require('path');
const config = require('./config');
const rp = require('../rp/rp');

const dbFilepath = path.resolve(`${config.data}/story.rprecord`);

const api = new express.Router();

/**
 * Add roomFile
 */
api.use((req, res, next) => {
  req.roomFile = dbFilepath;
  next();
});

api.use(rp);

module.exports = api;
