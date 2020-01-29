const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const ExpressJwt = require('express-jwt');

const filename = '.data/secret';

function generateSecret() {
  console.info('generating new secret');
  const jwtSecret = crypto.randomBytes(256/8)
  fs.writeFileSync(filename, jwtSecret, 'binary');
  return jwtSecret;
}

const jwtSecret = (fs.existsSync(filename))
  ? fs.readFileSync(filename)
  : generateSecret();

module.exports = function (realpassString) {
  const salt = Buffer.alloc(16);
  crypto.randomFillSync(salt);
  const iterations = 100000;
  const keylen = 64;
  const hash = 'sha512';
  
  const key = crypto.pbkdf2Sync(realpassString, salt, iterations, keylen, hash);

  return {
    checkPasscode(p) {
      return new Promise((resolve, reject) => {
        crypto.pbkdf2(p, salt, iterations, keylen, hash, (err, attempt) => {
          if (err) reject(err);
          else resolve(crypto.timingSafeEqual(attempt, key));
        });
      })
    },
    
    generateToken(roompass) {
      const userid = 'anon:' + crypto.randomBytes(16).toString('hex');
      const token = jwt.sign({ userid, roompass }, jwtSecret);
      return { userid, token };
    },

    authMiddleware: ExpressJwt({
      secret: jwtSecret,
      getToken(req) {
        return req.cookies.usertoken || null;
      },
      isRevoked(req, claims, done) {
        // I think it's ok that this is using non-timesafe compare,
        // because the only values to make it to here will be
        // previously-confirmed passcodes.
        // Besides, doing the pbkdf2 compare every single time
        // a request is made, would be so slow!
        done(null, claims.roompass !== realpassString)
      },
    }),
  };
};
