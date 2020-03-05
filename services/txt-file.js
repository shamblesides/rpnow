function wrap(str, indent='', width=72) {
  width -= indent.length;
  const regex = RegExp('.{0,' +width+ '}(\\s|$)|.{' +width+ '}|.+$', 'g');
  const lines = str.trim().match(regex).map(line => line.trimRight());
  if (lines[lines.length-1] === '') lines.pop();
  return indent + lines.join('\n'+indent);
}

function msgText(msg, charasMap) {
  if (msg.who === 'narrator') {
    return wrap(msg.content);
  } else if (msg.who === 'ooc') {
    return wrap(`(( OOC: ${msg.content} ))`);
  } else {
    const chara = charasMap.get(msg.who);
    if (!chara) throw new Error(`Couldn't find chara: ${msg.who}`);
    const indentedContent = wrap(msg.content, '  ');
    return `${chara.name.toUpperCase()}:\n${indentedContent}`;
  }
}

module.exports = ({
  generateTextFile({ title, msgs, charas, includeOOC }) {
    const charasMap = charas.reduce((map, c) => map.set(c._id, c), new Map());
    
    // Make sure to only write windows-compatible newlines
    const lines = [];
    const write = str => lines.push(str.replace(/\n/g, '\r\n'));

    // header format
    write(title);
    write('-------------');

    // Write each message
    for (const msg of msgs) {
      if (msg.type === 'image') {
        write(`--- IMAGE ---\n${msg.url}\n-------------`)
      } else if (msg.type === 'text') {
        if (msg.who === 'ooc' && !includeOOC) continue;
        
        const msgBlock = msgText(msg, charasMap);
        write(msgBlock);
      }
    }
    
    return lines.join('\r\n\r\n');
  },
});
