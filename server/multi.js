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
  const rooms = fs.readdirSync(roomsDirectory);
  const page = `
  <ul>
    ${rooms.map(room => {
      const n = room.match(/\d+/)[0];
      const fullPath = path.resolve(roomsDirectory, room);
      const { getTitle } = getContext(fullPath);
      // TODO XSS below
      return `<li><a target="_blank" href="/rp/${n}">${getTitle()}</a></li>`
    }).join('\n')}
    <li><a href="/rp">New</a></li>
  </ul>`
  res.send(page);
});

api.get('/rp', (req, res) => {
  const newID = Math.random().toString().slice(2, 2+6);
  res.redirect(301, `/rp/${newID}`);
})

/**
 * Add roomFile
 */
const routeToRoom = (req, res, next) => {
  req.roomFile = path.resolve(roomsDirectory, req.params.code + '.rprecord');
  next();
};

api.use('/rp/:code(\\d+)', routeToRoom, rp);

module.exports = api;
