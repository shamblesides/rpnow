const express = require('express');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { getContext } = require('../rp/context');
const rp = require('../rp/rp');

const api = new express.Router();

const roomsDirectory = path.resolve(config.data, 'rooms');

let lazyMakeDiretory = () => {
  lazyMakeDiretory = () => {};
  fs.mkdirSync(roomsDirectory, { recursive: true });
}

api.use((req, res, next) => {
  lazyMakeDiretory();
  next();
})

api.get('/', (req, res) => {
  res.sendFile(path.resolve(__dirname, './web/list.html'))
});

api.get('/rooms', (req, res) => {
  if (!req.user) {
    return res.sendStatus(401);
  }
  const files = fs.readdirSync(roomsDirectory);
  const rooms = files.map(file => {
    const id = file.match(/\w+/)[0];
    const fullPath = path.resolve(roomsDirectory, file);
    const ctx = getContext(fullPath);
    const title = ctx.getTitle();
    const lastMessage = ctx.Msgs.list({ reverse: true, limit: 1 })[0];
    const date = lastMessage ? lastMessage.timestamp : null;
    return { id, title, date };
  });
  res.json(rooms);
});

api.get('/rp', (req, res) => {
  const newID = Math.random().toString(36).slice(2, 2+6);
  res.redirect(301, `/rp/${newID}`);
})

/**
 * Add roomFile
 */
const routeToRoom = (req, res, next) => {
  req.roomFile = path.resolve(roomsDirectory, req.params.code + '.rprecord');
  next();
};

api.use('/rp/:code(\\w+)', routeToRoom, rp);

module.exports = api;
