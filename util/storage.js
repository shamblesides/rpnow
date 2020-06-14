/* ============================================================

TAILDB (name WIP!)

Embedded JSON key/value store with some oddities:

* Tiny (Less than 300 lines of code)
* Pure JS
* Zero dependencies
* Synchronous API (love it or hate it)
* Stores complete history of all values
* Corruption-resistant against incomplete writes
* Atomic batch writes
* Values ARE NOT kept in memory, so memory usage is low
* Keys ARE kept in memory, for fast pagination & key searching
* Monotonically increasing ID's for a prefix, if desired
* Create sub-DB restricted to a specific key prefix
* Hook to validate objects before inserting

License: MIT
Author: Nigel Nelson, 2020
============================================================ */

const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const os = require('os');
const idgen = require('./idgen');

/**
 * We can swap in a function here if we want granular debug statements
 */
// const debug = console.debug.bind(console);
const debug = () => {};

/**
 * Given a sorted array of strings, and a search value, this function
 * determines the number of values in the array that come before the
 * search value lexicographically.
 * 
 * In other words, find the index of the first value that is greater
 * than or equal to the search value. If all values are less, this
 * function returns the length of the array.
 * @param {Array<string>} arr SORTED array to search
 * @param {string} prefix The string to compare to
 * @param {number?} start First index of the array to search, inclusive
 * @param {number?} end Last index of the array to search, exclusive
 * @returns {number} number of values that come before the search string,
 * even if it is not in the array
 */
function findFirstSorted(arr, prefix, start=0, end=arr.length) {
  if (start >= end) return start;
  const m = (start+end)/2|0;
  if (arr[m] < prefix) return findFirstSorted(arr, prefix, m+1, end);
  else return findFirstSorted(arr, prefix, start, m);
}

/**
 * Given a sorted array of strings, and a prefix string, find the range
 * of values that start with a given prefix.
 * 
 * If there are no prefixes in the range, the start index and the (exclusive!)
 * end index will be equal to each other. Their values will be the first
 * index of a value that comes after the prefix (or the array length if
 * all values come before it.)
 * @param {Array<string>} arr SORTED array to search
 * @param {string} prefix prefix that all keys in the range should start with
 * @returns {[number, number]} The first index (inclusive) and last index
 * (exclusive) of values with the prefix.
 */
function prefixRange(arr, prefix) {
  // The last index is determined by finding the first key that is greater than
  // (prefix + very_high_unicode_character). This effectively gives us the
  // exclusive last index.
  return [findFirstSorted(arr, prefix), findFirstSorted(arr, prefix+'\ufff0')];
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
    debug(`read ${bytesRead} (total ${totalBytes})`);
    debug(`in wip: ${wip.length}`);
    while (1) {
      const lineEnd = wip.indexOf('\n');
      if (lineEnd === -1) break;
      debug(`found line end: ${lineEnd}`);

      let line = wip.subarray(0, lineEnd);
      while (line.length > 0) {
        const indexOfTab = line.indexOf('\t');
        const recordEnd = indexOfTab >= 0 ? indexOfTab : line.length;
        debug(`record goes until ${recordEnd}`)
        const json = line.subarray(0, recordEnd).toString();

        register(json);

        line = line.subarray(recordEnd + 1);
      }

      wip = wip.subarray(lineEnd + 1);
    }
    if (bytesRead < readsize) break;
  }

  if (wip.length > 0) {
    console.warn(`removing ${wip.length} bytes at end of db`);
    fs.truncateSync(dbfile, totalBytes - wip.length);
  }
  debug('loaded db');
}

module.exports = DB;
/**
 * Opens and initializes a database from a file on disk.
 * @param {string} dbfile Absolute path to the file
 */
function DB(dbfile) {
  // ==================================
  // 0. IN-MEMORY STRUCTURES
  // ==================================

  /**
   * Lexicographically sorted list of keys in the database.
   * An item with multiple revisions still only appears in this
   * array once.
   * @type {Array<string>}
   */
  const keys = [];

  /**
   * Stores information on where the document's JSON is stored in the
   * database file. A value in this object is an array. Each element
   * of that array represents a revision of the document, and where
   * to find it in the file, stored as an inner two-element array
   * in the form of [offset, length].
   * @type {Object.<string, Array<[number, number]>>}
   */
  const infos = {};

  /**
   * This tracks the last stable length of the file.
   * 
   * It's possible that the actual current length will be longer,
   * if the databse is in the middle of a write.
   */
  let end = 0;

  /**
   * getNextID() gives a unique, monotonically-increasing
   * string that can be used as an ID. These are based
   * on the curren ttimestamp and a counter component.
   */
  const getNextID = idgen();

  /**
   * Checks how many revisions a particular document has.
   * This might be 0 if a document with the given _id has
   * not yet been added.
   * @param {string} _id Document _id
   * @returns {number} Number of revisions, possibly 0
   */
  function revCount(_id) {
    return (infos[_id] || []).length;
  }

  /**
   * Finds the last _rev value for a document
   * of a given key. Because _rev is 1-based,
   * not 0-based, this is equal to the number
   * of revisions.
   * @param {string} _id Document _id
   * @returns {number} Last revision number,
   * or `null` if not in database
   */
  function lastRevNum(_id) {
    return revCount(_id) || null;
  }

  /**
   * Add metadata about our JSON record to our in-memory metadata
   * storage.
   * @param {string} json A JSON string of the object
   * @param {string?} _id Optional _id of the object. If not provided,
   * it will be parsed from the JSON. This arg is just used to speed up
   * insertion if the _id is already known.
   */
  function register(json, _id=JSON.parse(json)._id) {
    debug('registering', json);

    const size = Buffer.byteLength(json);

    if (infos[_id] == null) {
      infos[_id] = [];

      const insertIndex = findFirstSorted(keys, _id);
      keys.splice(insertIndex, 0, _id);
    }

    infos[_id].push([end, size]);

    end += size + 1;

    return infos[_id].length; // _rev num
  }

  /**
   * Retrieve a JSON document from disk.
   * @param {string} _id 
   * @param {number} _rev Revision number. If not provided, retrieves
   * the most recent.
   */
  function read(_id, _rev=lastRevNum(_id)) {
    if (revCount(_id) === 0) throw new Error('_id not in database');

    const info = infos[_id][_rev - 1];
    if (!info) throw new Error('_rev not in database');

    const [position, length] = info;
    const buf = Buffer.alloc(length);
    fs.readSync(fd, buf, 0, length, position);
    const { _id: _id_, ...obj } = JSON.parse(buf);
    return { _id, _rev, ...obj };
  }

  // ==================================
  // 1. CHECK & CREATE LOCKFILE
  // ==================================
  // (Not done in here)

  // ==================================
  // 2. GET METADATA FROM FILE
  // ==================================

  // Open the file for reading.
  const fd = fs.openSync(dbfile, 'r', 0o660);

  // Parse the DB
  readDB(dbfile, fd, register);

  // ==================================
  // 3. RETURN PUBLIC API
  // ==================================
  const DB = ({
    prefix='',
    validators=[],
    autoid=false,
    eventEmitters=[new EventEmitter()],
  }) => ({
    prefix(p) {
      return DB({
        prefix: prefix+p,
        validators,
        autoid,
        eventEmitters: eventEmitters.concat([new EventEmitter()]),
      });
    },
    constrain(validator) {
      return DB({
        prefix,
        validators: validators.concat([validator]),
        autoid,
        eventEmitters: eventEmitters.concat([new EventEmitter()]),
      });
    },
    autoid() {
      return DB({
        prefix,
        validators,
        autoid: true,
        eventEmitters: eventEmitters.concat([new EventEmitter()]),
      });
    },
    put(...objs) {
      const modified = objs.map(inputObj => {
        if (typeof inputObj !== 'object') throw new Error('not an object');

        let { _rev, ...obj } = inputObj;

        for (const validator of validators) {
          validator(obj); // should throw error if invalid
        }
        
        // Error checking with the _id
        if ('_id' in obj) {
          if (typeof obj._id !== 'string') throw new Error('_id must be a string');

          if (prefix) {
            // if it's a group, check that _id has the prefix
            if (!obj._id.startsWith(prefix)) throw new Error(`_id should begin with ${prefix}`);
          }
          if (autoid) {
            // can't arbitrarily insert new _id's if the server is supposed to generate them.
            if (revCount(obj._id) == 0) throw new Error('list item with this _id does not exist');
          }
        } else {
          // must provide id if they aren't generated automatically
          if (!autoid) throw new Error('missing _id');
        }

        // Error checking with the _rev
        if (_rev != null) {
          if (!(_rev >= 1)) throw new Error('invalid _rev');
          if (!('_id' in obj)) throw new Error('object has _rev, but no id');
          if (_rev < lastRevNum(obj._id)) throw new Error('_rev conflict');
          if (_rev !== lastRevNum(obj._id)) throw new Error('wrong _rev');
        }

        // Generate _id if it needs one
        if (!('_id' in obj)) {
          obj = { _id: prefix+getNextID(), ...obj };
          // If this generates an error, it's either a logic error for the application, or a bug
          if (revCount(obj._id) !== 0) throw new Error(`INTERNAL ERROR! tried to use _id ${obj._id} but it already exists`);
        }

        return obj;
      });
      const jsons = modified.map(obj => JSON.stringify(obj));
      jsons.forEach((json, i) => {
        const _rev = register(json, objs[i]._id);
        
        // makes it so _rev is the second prop on the object
        const { _id, ...obj } = modified[i];
        modified[i] = { _id, _rev, ...obj };
      })
      fs.appendFileSync(dbfile, jsons.join('\t')+'\n');
      for (const eventEmitter of eventEmitters) {
        for (const obj of modified) {
          eventEmitter.emit('update', obj);
        }
      }

      return modified;
    },
    has(_id) {
      if (typeof _id !== 'string') throw new Error('invalid id');
      if (!_id.startsWith(prefix)) throw new Error('_id has wrong prefix');
      return !!infos[_id];
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
      const [i0, i1] = prefixRange(keys, prefix);
      const [start, end, inc] = (!reverse) ? [i0+skip, i1, 1] : [i1-1-skip, i0-1, -1];
      for (let i = start; Math.sign(end-i) === inc; i += inc) {
        if (--limit < 0) return;
        yield read(keys[i]);
      }
    },
    list({ skip=0, limit=Infinity, reverse=false }={}) {
      return [...this.iterator({ skip, limit, reverse })]
    },
    count() {
      if (!prefix) return keys.length;

      const [i0, i1] = prefixRange(keys, prefix);
      return i1 - i0;
    },
    get updates() {
      return eventEmitters[eventEmitters.length-1];
    },
  });

  return DB({});
}

