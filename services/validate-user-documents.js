const is = (value) => function (x) {
  if (x !== value) throw new Error(`isn't <${value}>`);
}
const isString = (length) => function (str) {
  if (typeof str !== 'string') throw new Error('is not a string');
  if (str.length > length) throw new Error(`too long: ${str.length} chars`)
}
const matchRegex = (regex) => function (str) {
  if (typeof str !== 'string') throw new Error('is not a string');
  if (str.match(regex) === null) throw new Error('does not match pattern')
}
const isUrl = matchRegex(/^https?:\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]+$/gi);

const timestamp = matchRegex(/^\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+Z$/);

const obj = (shape) => function (o) {
  if (typeof o !== 'object') throw new Error('not an object');
  for (const [key, isValid] of Object.entries(shape)) {
    try {
      isValid(o[key]);
    } catch (err) {
      throw new Error(`{ ${key}: ${err.message} }`);
    }
  }
  const reservedKeys = ['_id', '_rev'];
  for (const key of Object.keys(o)) {
    if (!reservedKeys.includes(key) && !(key in shape)) {
      throw new Error(`{ ${key}: extra prop }`);
    }
  }
}

const any = (...ways) => function (o) {
  let errs = [];
  for (const way of ways) {
    try {
      way(o);
      return;
    } catch (err) {
      errs.push(err.message);
    }
  }
  throw new Error('no matches: ' + errs.join('; '));
}

const userid = isString(40);

module.exports.msg = any(
  obj({
    type: is('image'),
    url: isUrl,
    userid,
    timestamp,
  }),
  obj({
    type: is('chara'),
    content: isString(10000),
    charaId: isString(8),
    userid,
    timestamp,
  }),
  obj({
    type: any(is('narrator'), is('ooc')),
    content: isString(10000),
    userid,
    timestamp,
  })
);

module.exports.chara = obj({
  name: isString(30),
  color: matchRegex(/^#[0-9a-f]{6}$/g),
  userid,
  timestamp,
});
  
module.exports.webhook = obj({
  webhook: matchRegex(/^https:\/\/discordapp.com\/api\/webhooks\/[\w/]+/),
  userid,
});
