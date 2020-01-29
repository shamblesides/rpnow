/**
 * The format of RP files is a large JSON array
 * The first element of the array is { version, title, charas }
 * The remaining documents will be messages
 */

const { Writable, Transform } = require('stream');
const JSONStream = require('JSONStream');

class BatchStream extends Transform {
  constructor(options) {
    super(options);

    if (!options.bufferSize) throw new Error('BatchStream: Specify buffer size');
    this.bufferSize = options.bufferSize;
    this.buffer = [];
  }
  _transform(item, encoding, callback) {
    this.buffer.push(item);
    if (this.buffer.length >= this.bufferSize) {
      this.push(this.buffer);
      this.buffer = [];
    }
    callback();
  }
  _flush(callback) {
    this.push(this.buffer);
    this.buffer = [];
    callback();
  }
}

module.exports = ({
  exportRp({ title, msgs, charas }, write) {
    // TODO export webhooks?

    const charaIdMap = charas.reduce((map,{_id},i) => map.set(_id,i), new Map());

    charas = charas.map(({ timestamp, name, color }) => ({ timestamp, name, color }))

    write(`[\n${JSON.stringify({ version: 1, title, charas })}`);
    
    for (const msgRaw of msgs) {
      const { timestamp, type, content, url, charaId } = msgRaw;
      const msg = { timestamp, type, content, url, charaId: charaIdMap.get(charaId) };
      write(`,\n${JSON.stringify(msg)}`)
    }
    
    write('\n]\n');
  },

  importRp(rawStream, { userid, batchSize=1000 }, { addMsgs, addCharas, setTitle, onComplete }) {
    let handledMeta = false;
    const charaIdMap = new Map();
    // TODO import webhooks

    rawStream
      // Parse incoming text stream into elements of a JSON array
      .pipe(JSONStream.parse([true]))

      // Handle the initial element, the metadata. Then pass everything else through
      .pipe(new Transform({
        objectMode: true,
        async write(chunk, encoding, callback) {
          if (handledMeta) {
            this.push(chunk);
            callback();
            return;
          }

          let { charas, title } = chunk;
          
          await setTitle(title);

          // add userid
          charas = charas.map((body) => ({ ...body, userid }));

          charas = await addCharas(charas);
          
          // populate charaIdMap
          charas.forEach((chara, i) => charaIdMap.set(i, chara._id))

          handledMeta = true;
          callback();
        }
      }))

      // The remaining elements are messages. Batch them to be processed in groups
      .pipe(new BatchStream({
        objectMode: true,
        bufferSize: batchSize,
      }))
      
      // Add each message to the database
      .pipe(new Transform({
        objectMode: true,
        async write(msgs, encoding, callback) {
          // hydrate msg
          msgs = msgs.map((body) => {
            if (body.charaId != null) {
              body.charaId = charaIdMap.get(body.charaId);
            }
            if (body.content != null) {
              body.content = body.content.substr(0, 10000);
            }
            body.userid = body.userid || userid;
            return body;
          });

          await addMsgs(msgs);
          
          callback();
        }
      }))

      // Done!
      .on('finish', () => onComplete());
    
      // TODO handle errors in here
  },
});
