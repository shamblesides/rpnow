const fetch = require('node-fetch');

module.exports = (req, res, next) => {
  const packageName = require('../package.json').name;
  const version = require('../package.json').version;
  fetch(`https://registry.npmjs.org/${packageName}`)
  .then(res => res.json())
  .then(data => data['dist-tags'].latest)
  .then(latest => {
    res.json({
      current: version,
      latest,
    })
  })
  .catch(err => {
    console.warn(`Couldn't fetch latest version. (${err.name}: ${err.message})`);
    res.json({
      current: version,
      latest: version,
    })
  })
  .catch(next);
}