const fs = require('fs');

// const debug = console.debug.bind(console);
const debug = () => {}

function findFirstSorted(arr, prefix, start=0, end=arr.length) {
  if (start >= end) return start;
  const m = (start+end)/2|0;
  if (arr[m] < prefix) return findFirstSorted(arr, prefix, m+1, end);
  else return findFirstSorted(arr, prefix, start, m);
}

function prefixRange(arr, prefix) {
  return [findFirstSorted(arr, prefix), findFirstSorted(arr, prefix+'\ufff0')]
}

function readDB(dbfile, fd, register) {
  const readsize = 256;
  const buf = Buffer.alloc(readsize);
  let totalBytes = 0;
  let wip = Buffer.alloc(0);
  while (1) {
    const bytesRead = fs.readSync(fd, buf, 0, readsize);
    totalBytes += bytesRead;
    wip = Buffer.concat([wip, buf.subarray(0, bytesRead)]);
    debug(`read ${bytesRead} (total ${totalBytes})`)
    debug(`in wip: ${wip.length}`)
    while (1) {
      const lineEnd = wip.indexOf('\n');
      if (lineEnd === -1) break;
      debug(`found line end: ${lineEnd}`)

      let line = wip.subarray(0, lineEnd);
      while (line.length > 0) {
        const indexOfTab = line.indexOf('\t');
        const recordEnd = indexOfTab >= 0 ? indexOfTab : line.length;
        debug(`record goes until ${recordEnd}`)
        const json = line.subarray(0, recordEnd).toString();

        register(json);

        line = line.subarray(recordEnd + 1)
      }
      
      wip = wip.subarray(lineEnd + 1);
    }
    if (bytesRead < readsize) break;
  }

  if (wip.length > 0) {
    console.warn(`removing ${wip.length} bytes at end of db`)
    fs.truncateSync(dbfile, totalBytes - wip.length);
  }
  debug('loaded db')
}

module.exports = DB;
function DB(dbfile) {
  // Make file if not exists
  fs.closeSync(fs.openSync(dbfile, 'a'));

  // Opens a file (read/append, synchronous i/o, create if not exists)
  // const fd = fs.openSync(dbfile, 'as+', 0o660);
  const fd = fs.openSync(dbfile, 'r', 0o660);

  const _meta = {
    keys: [], // [<string>, ...] alph order, no dupes
    infos: {}, // { [key]: [[<offset>, <length>], ...] }
    log: [], // [<string>, ...] insertion order, dupes for each put
  };

  let end = 0;

  function register(json, _id) {
    debug('registering', json)
    _id = _id || JSON.parse(json)._id;

    const size = Buffer.byteLength(json);

    if (_meta.infos[_id] == null) {
      _meta.infos[_id] = [];
      _meta.keys.push(_id);
      _meta.keys.sort();
    }

    _meta.infos[_id].push([end, size])

    _meta.log.push(_id);

    end += size + 1;
    
    return _meta.infos[_id].length; // _rev num
  }

  readDB(dbfile, fd, register)

  let _nextId = _meta.keys.length;
  function id() {
    return (_nextId++).toString(36).padStart(5, '0');
  }

  function revCount(_id) {
    return (_meta.infos[_id] || []).length;
  }

  // _rev is 1-based, not 0-based
  function lastRevNum(_id) {
    return revCount(_id) || null;
  }

  function read(_id, _rev) {
    if (revCount(_id) === 0) throw new Error('_id not in database');
    if (_rev == null) _rev = lastRevNum(_id);

    const info = _meta.infos[_id][_rev - 1];
    if (!info) throw new Error('_rev not in database');

    const [position, length] = info
    const buf = Buffer.alloc(length);
    fs.readSync(fd, buf, 0, length, position);
    const { _id: _id_, ...obj } = JSON.parse(buf);
    return { _id, _rev, ...obj };
  }

  const DB = ({ prefix='', validator=()=>true }) => ({
    group: prefix ? null : function (prefix, v=validator) {
      return DB({ prefix, validator: v });
    },
    put(...objs) {
      const modified = objs.map(obj => {
        if (typeof obj !== 'object') throw new Error('not an object')
        obj = Object.assign({}, obj);
        if (obj._id == null) {
          if (!prefix) throw new Error('missing _id');
          obj._id = prefix+id();
        } else {
          // if it's a group, check that _id has the prefix
          if (typeof obj._id !== 'string') throw new Error('_id must be a string');
          if (prefix && !obj._id.startsWith(prefix)) throw new Error('wrong _id prefix');

          if (revCount(obj._id) == 0) { // CREATE
            if (prefix || obj._rev) throw new Error('list item with this _id does not exist');
          } else { // UPDATE
            if (obj._rev != null && obj._rev !== lastRevNum(obj._id)) throw new Error('_rev conflict');
          }
        }
        delete obj._rev;
        validator(obj); // should throw error if invalid
        return obj;
      });
      const jsons = modified.map(obj => JSON.stringify(obj));
      jsons.forEach((json, i) => {
        const _rev = register(json, objs[i]._id);
        modified[i]._rev = _rev;
      })
      fs.appendFileSync(dbfile, jsons.join('\t')+'\n');
      return modified;
    },
    has(_id) {
      if (typeof _id !== 'string') throw new Error('invalid id');
      if (!_id.startsWith(prefix)) throw new Error('_id has wrong prefix');
      return !!_meta.infos[_id];
    },
    findOrFail(_id) {
      if (!this.has(_id)) throw new Error('_id not found');
      return read(_id);
    },
    find(_id) {
      if (!this.has(_id)) return null;
      return read(_id);
    },
    history(_id) {
      if (!this.has(_id)) throw new Error('_id not found');
      const revs = lastRevNum(_id);
      const arr = [];
      for (let _rev = 1; _rev <= revs; ++_rev) {
        arr.push(read(_id, _rev))
      }
      return arr;
    },
    * iterator ({ skip=0, limit=Infinity, reverse=false }={}) {
      if (!(skip >= 0)) throw new Error('skip must be >= 0');
      const [i0, i1] = prefixRange(_meta.keys, prefix);
      const [start, end, inc] = (!reverse) ? [i0+skip, i1, 1] : [i1-1-skip, i0-1, -1];
      for (let i = start; Math.sign(end-i) === inc; i += inc) {
        if (--limit < 0) return;
        yield read(_meta.keys[i]);
      }
    },
    list({ skip=0, limit=Infinity, reverse=false }={}) {
      return [...this.iterator({ skip, limit, reverse })]
    },
    count() {
      if (!prefix) return _meta.keys.length;

      const [i0, i1] = prefixRange(_meta.keys, prefix);
      return i1 - i0;
    },
  });

  return DB({});
}
