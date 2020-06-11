const express = require('express');
const path = require('path');
const os = require('os');
const { getContext, initContext } = require('./context');

const api = new express.Router();

function getDBFilepath(req) {
  return path.resolve(os.tmpdir(), `rpdemo-${req.user.userid}`)
}

const addContext = (req, res, next) => {
  const dbFilepath = getDBFilepath(req);
  req.ctx = getContext(dbFilepath);
  next();
}

const populateRP = (req, res, next) => {
  const dbFilepath = getDBFilepath(req);
  if (!getContext(dbFilepath)) {
    const { setTitle, Msgs, Charas, Users } = initContext(dbFilepath);
    setTitle('My Demo RP');
    const meta = { userid: 'u-0000000', timestamp: new Date().toJSON() };
    const [{ _id: cid }] = Charas.put({ name: 'The RP Witch', color: '#8363cd', ...meta })
    Users.put({
      _id: 'u-0000000',
      name: 'DemoBot',
    }),
    Msgs.put({
      type: 'image',
      url: 'https://66.media.tumblr.com/be81b19872926ee3388ebf12c12c8c01/tumblr_ood5t2VSVM1urbwufo1_1280.png',
      ...meta
    })
    Msgs.put({
      type: 'text',
      who: cid,
      content: 'Welcome to the Demo RP! Feel free to test out this app here!',
      ...meta
    })
    Msgs.put({
      type: 'text',
      who: cid,
      content: 'When you are ready, go here to find out how to make your own server on glitch.com: https://glitch.com/edit/#!/remix/rpnow?PASSCODE=%22Change%20me%22&LOCKDOWN=no',
      ...meta
    })
  }
  next();
};

api.use('/rp', populateRP, addContext);

module.exports = api;
